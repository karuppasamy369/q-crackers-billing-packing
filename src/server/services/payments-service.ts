import "server-only";

import { db } from "@/server/db";
import type { Prisma, PaymentStatus } from "@/generated/prisma";
import { requirePermission } from "@/server/rbac/authorize";
import { recordAudit } from "@/server/services/audit";
import { getRequestContext } from "@/server/http/request-context";
import { auditActor } from "@/server/services/_helpers";
import { AppError, NotFoundError, ValidationError } from "@/server/http/errors";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { formatPaise } from "@/lib/money";
import { normalizeUpiReference, buildUpiUri } from "@/lib/upi";
import {
  submitPaymentSchema,
  verifyPaymentSchema,
  paymentIdSchema,
  type SubmitPaymentInput,
} from "@/lib/validation/payment";
import { getPublicPaymentAccountForPartner } from "@/server/services/payment-accounts-service";
import {
  issueBillForOrderCore,
  safeGeneratePdf,
} from "@/server/services/billing-service";
import { getVerifier } from "@/server/integrations/payment/verifier";
import { enqueueNotificationSafe } from "@/server/services/notifications-service";

const PAGE_SIZE = 25;
const SUBMIT_RATE_MAX = 6;
const SUBMIT_RATE_WINDOW_MS = 10 * 60_000;

/** Payment states that occupy the "one active payment per order" slot. */
const ACTIVE_PAYMENT_STATUSES: PaymentStatus[] = [
  "INITIATED",
  "SUBMITTED",
  "VERIFIED",
];

const ALL_PAYMENT_STATUSES: PaymentStatus[] = [
  "INITIATED",
  "SUBMITTED",
  "VERIFIED",
  "REJECTED",
  "FAILED",
];

// ---------------------------------------------------------------------------
// Customer-facing: payment page context + submitting a UTR
// ---------------------------------------------------------------------------

export type PaymentPageContext = {
  reference: string;
  orderStatus: string;
  paymentStatus: string;
  totalPaise: number;
  partner: {
    code: string;
    partnerId: string;
    upiVpa: string | null;
    payeeName: string | null;
    instructions: string | null;
    hasStaticQr: boolean;
  } | null;
  upiUri: string | null;
  payment: {
    status: string;
    upiReference: string | null;
    submittedAt: Date | null;
  } | null;
};

async function loadOrderByReference(reference: string) {
  const order = await db.order.findUnique({
    where: { reference },
    include: { items: true },
  });
  if (!order) throw new NotFoundError("Order not found.");
  return order;
}

export async function getPaymentPageContext(
  rawReference: string,
): Promise<PaymentPageContext> {
  const ref = submitPaymentSchema.shape.reference.safeParse(rawReference);
  if (!ref.success) throw new NotFoundError("Order not found.");

  const order = await db.order.findUnique({
    where: { reference: ref.data },
    include: {
      payments: {
        where: { status: { in: ACTIVE_PAYMENT_STATUSES } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!order) throw new NotFoundError("Order not found.");

  const partnerAccount = order.assignedPartnerId
    ? await getPublicPaymentAccountForPartner(order.assignedPartnerId)
    : null;

  const payment = order.payments[0] ?? null;

  const upiUri =
    partnerAccount?.upiVpa && order.status === "AWAITING_PAYMENT"
      ? buildUpiUri({
          vpa: partnerAccount.upiVpa,
          payeeName:
            partnerAccount.payeeName ??
            order.assignedPartnerCode ??
            "Q Crackers",
          amountPaise: order.totalPaise,
          note: `Order ${order.reference.slice(0, 10)}`,
        })
      : null;

  return {
    reference: order.reference,
    orderStatus: order.status,
    paymentStatus: order.paymentStatus,
    totalPaise: order.totalPaise,
    partner: partnerAccount
      ? {
          code: partnerAccount.partnerCode,
          partnerId: order.assignedPartnerId!,
          upiVpa: partnerAccount.upiVpa,
          payeeName: partnerAccount.payeeName,
          instructions: partnerAccount.instructions,
          hasStaticQr: partnerAccount.hasStaticQr,
        }
      : null,
    upiUri,
    payment: payment
      ? {
          status: payment.status,
          upiReference: payment.upiReference,
          submittedAt: payment.submittedAt,
        }
      : null,
  };
}

/**
 * The customer states they have paid and supplies their UPI transaction id.
 * This records a SUBMITTED payment — it does NOT mark the order paid. An
 * authorised person (or, later, a PSP lookup / webhook) verifies it.
 */
export async function submitPayment(
  rawReference: unknown,
  raw: unknown,
): Promise<{ status: "submitted" | "already_submitted" | "already_paid" }> {
  const ctx = await getRequestContext();
  const rl = rateLimit(
    `payment:submit:${ctx.ip ?? "unknown"}`,
    SUBMIT_RATE_MAX,
    SUBMIT_RATE_WINDOW_MS,
  );
  if (!rl.allowed) {
    throw new AppError(
      "RATE_LIMITED",
      "Too many attempts. Please wait a few minutes and try again.",
    );
  }

  const parsed = submitPaymentSchema.safeParse({
    ...(typeof raw === "object" && raw ? raw : {}),
    reference: rawReference,
  });
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Please check the details and retry.",
    );
  }
  const input: SubmitPaymentInput = parsed.data;
  const utr = normalizeUpiReference(input.upiReference);
  const payerName = input.payerName || null;
  const payerVpa = input.payerVpa || null;

  const order = await loadOrderByReference(input.reference);
  if (order.paymentStatus === "PAID") return { status: "already_paid" };
  if (order.status !== "AWAITING_PAYMENT") {
    throw new ValidationError("This order is not awaiting payment.");
  }

  const partnerAccount = order.assignedPartnerId
    ? await getPublicPaymentAccountForPartner(order.assignedPartnerId)
    : null;

  const existing = await db.payment.findFirst({
    where: { orderId: order.id, status: { in: ACTIVE_PAYMENT_STATUSES } },
  });
  if (existing?.status === "VERIFIED") return { status: "already_paid" };

  // A UTR is recorded at most once, anywhere.
  const utrClash = await db.payment.findFirst({
    where: {
      upiReference: utr,
      ...(existing ? { id: { not: existing.id } } : {}),
    },
  });
  if (utrClash) {
    throw new ValidationError(
      "That transaction ID has already been recorded. If you think this is a mistake, please contact us.",
    );
  }

  if (existing) {
    await db.payment.update({
      where: { id: existing.id },
      data: {
        status: "SUBMITTED",
        upiReference: utr,
        payerName: payerName ?? existing.payerName,
        payerVpa: payerVpa ?? existing.payerVpa,
        submittedAt: existing.submittedAt ?? new Date(),
      },
    });
    await recordAudit(
      { kind: "system" },
      {
        action: "payment.submit",
        summary: `Payment details updated for order ${order.reference}`,
        entityType: "Payment",
        entityId: existing.id,
        details: { reference: order.reference, upiReference: utr },
      },
      ctx,
    );
    return { status: "already_submitted" };
  }

  const created = await db.payment.create({
    data: {
      orderId: order.id,
      channel: "UPI",
      provider: "MANUAL",
      status: "SUBMITTED",
      amountPaise: order.totalPaise,
      currency: "INR",
      upiReference: utr,
      payerName,
      payerVpa,
      payeeVpa: partnerAccount?.upiVpa ?? null,
      payeeName: partnerAccount?.payeeName ?? null,
      assignedPartnerId: order.assignedPartnerId,
      submittedAt: new Date(),
    },
  });

  await recordAudit(
    { kind: "system" },
    {
      action: "payment.submit",
      summary: `Customer submitted payment for order ${order.reference} — ${formatPaise(order.totalPaise)}`,
      entityType: "Payment",
      entityId: created.id,
      details: {
        reference: order.reference,
        upiReference: utr,
        amountPaise: order.totalPaise,
      },
    },
    ctx,
  );
  return { status: "submitted" };
}

// ---------------------------------------------------------------------------
// Internal: stock ledger transitions
// ---------------------------------------------------------------------------

type OrderItemLite = { productId: string; quantity: number };

async function lockInventory(
  tx: Prisma.TransactionClient,
  items: OrderItemLite[],
) {
  const ids = [...new Set(items.map((i) => i.productId))].sort();
  for (const id of ids) {
    await tx.$queryRaw`SELECT 1 FROM "inventory" WHERE "productId" = ${id}::uuid FOR UPDATE`;
  }
}

/** Payment confirmed: stock physically leaves. Reserved -> sold. */
async function commitStockAsSale(
  tx: Prisma.TransactionClient,
  order: { id: string; reference: string },
  items: OrderItemLite[],
  actorId: string | null,
) {
  await lockInventory(tx, items);
  for (const item of items) {
    const inv = await tx.inventory.findUnique({
      where: { productId: item.productId },
    });
    if (!inv) continue;
    const balanceAfter = inv.quantityOnHand - item.quantity;
    await tx.inventory.update({
      where: { productId: item.productId },
      data: {
        quantityOnHand: balanceAfter,
        quantityReserved: {
          decrement: Math.min(item.quantity, inv.quantityReserved),
        },
      },
    });
    await tx.inventoryMovement.create({
      data: {
        productId: item.productId,
        changeQty: -item.quantity,
        balanceAfter,
        reason: "SALE",
        note: `Order ${order.reference}`,
        refType: "order",
        refId: order.id,
        createdById: actorId,
      },
    });
  }
}

/** Release a hold without any physical movement (mirrors checkout reserve). */
async function releaseReservation(
  tx: Prisma.TransactionClient,
  items: OrderItemLite[],
) {
  await lockInventory(tx, items);
  for (const item of items) {
    const inv = await tx.inventory.findUnique({
      where: { productId: item.productId },
    });
    if (!inv) continue;
    await tx.inventory.update({
      where: { productId: item.productId },
      data: {
        quantityReserved: {
          decrement: Math.min(item.quantity, inv.quantityReserved),
        },
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Verify / reject a payment (authorised manual fallback)
// ---------------------------------------------------------------------------

export async function verifyPayment(raw: unknown) {
  const auth = await requirePermission("payments.confirm_manual");
  const input = verifyPaymentSchema.parse(raw);
  const ctx = await getRequestContext();

  const payment = await db.payment.findUnique({
    where: { id: input.paymentId },
    include: { order: { include: { items: true } } },
  });
  if (!payment) throw new NotFoundError("That payment does not exist.");
  const order = payment.order;

  // The verification checks the correct order AND amount.
  if (payment.amountPaise !== order.totalPaise) {
    throw new ValidationError(
      `The payment amount (${formatPaise(payment.amountPaise)}) does not match the order total (${formatPaise(order.totalPaise)}). Reject it and ask the customer to pay again.`,
    );
  }

  // Idempotency — a processed payment is not re-processed.
  if (payment.status === "VERIFIED") return loadPaymentDetail(payment.id);
  if (payment.status === "REJECTED" || payment.status === "FAILED") {
    throw new ValidationError(
      `This payment is ${payment.status.toLowerCase()} and can no longer be changed.`,
    );
  }

  const items: OrderItemLite[] = order.items.map((i) => ({
    productId: i.productId,
    quantity: i.quantity,
  }));
  const utr = input.upiReference
    ? normalizeUpiReference(input.upiReference)
    : payment.upiReference;

  if (input.action === "reject") {
    await db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "REJECTED",
          rejectionReason: input.note || "Payment not received",
          verifiedById: auth.user.id,
          verifiedAt: new Date(),
          verificationMethod: "MANUAL",
        },
      });
      await releaseReservation(tx, items);
      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: "FAILED", status: "PAYMENT_FAILED" },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: "PAYMENT_FAILED",
          changedById: auth.user.id,
          reason: `Payment rejected: ${input.note}`,
        },
      });
      await recordAudit(
        auditActor(auth),
        {
          action: "payment.reject",
          summary: `${auth.user.code} rejected payment for order ${order.reference}`,
          entityType: "Payment",
          entityId: payment.id,
          details: { reference: order.reference, reason: input.note },
        },
        ctx,
        tx,
      );
    });
    return loadPaymentDetail(payment.id);
  }

  // --- action === "verify" ------------------------------------------------
  const verifier = getVerifier(payment.provider);
  const verificationMethod = verifier.lookup ? "PSP_API" : "MANUAL";

  await db.$transaction(async (tx) => {
    const fresh = await tx.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true, paymentStatus: true },
    });
    // Someone verified concurrently — make this call a no-op.
    if (fresh.paymentStatus === "PAID") return;

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "VERIFIED",
        upiReference: utr,
        verifiedById: auth.user.id,
        verifiedAt: new Date(),
        verificationMethod,
      },
    });

    await commitStockAsSale(tx, order, items, auth.user.id);

    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: "PAID", status: "PAID" },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: fresh.status,
        toStatus: "PAID",
        changedById: auth.user.id,
        reason: `Payment verified (${verificationMethod})`,
      },
    });

    await recordAudit(
      auditActor(auth),
      {
        action: "payment.verify",
        summary: `${auth.user.code} verified payment for order ${order.reference} — ${formatPaise(payment.amountPaise)}`,
        entityType: "Payment",
        entityId: payment.id,
        details: {
          reference: order.reference,
          upiReference: utr,
          amountPaise: payment.amountPaise,
          method: verificationMethod,
        },
      },
      ctx,
      tx,
    );
    await recordAudit(
      auditActor(auth),
      {
        action: "order.paid",
        summary: `Order ${order.reference} marked PAID`,
        entityType: "Order",
        entityId: order.id,
        details: { reference: order.reference, paymentId: payment.id },
      },
      ctx,
      tx,
    );
  });

  // Auto-issue the bill under the order's assigned partner, outside the
  // payment transaction. A failure here (e.g. a mis-configured partner code)
  // leaves the order PAID but un-billed — it does not undo the payment.
  try {
    const freshOrder = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true, bill: true },
    });
    if (!freshOrder.bill) {
      const bill = await issueBillForOrderCore(
        freshOrder,
        freshOrder.items,
        { id: auth.user.id, code: auth.user.code, role: auth.user.role },
        ctx,
      );
      await safeGeneratePdf(bill.id);
    }
  } catch (err) {
    logger.error("payment.verify.bill_failed", {
      orderId: order.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Notify the customer (best-effort, after commit). A WhatsApp hiccup never
  // undoes a verified payment; anything missed here is recovered by the
  // notification worker's reconciliation sweep.
  await enqueueNotificationSafe({
    orderId: order.id,
    eventType: "PAYMENT_RECEIVED",
  });

  return loadPaymentDetail(payment.id);
}

// ---------------------------------------------------------------------------
// Console reads
// ---------------------------------------------------------------------------

export async function listPayments(
  filter: {
    q?: string;
    status?: string;
    partnerCode?: string;
    page?: number;
  } = {},
) {
  await requirePermission("payments.view");
  const page = Math.max(1, Math.floor(filter.page ?? 1));

  const where: Prisma.PaymentWhereInput = {};
  if (filter.q) {
    where.OR = [
      { upiReference: { contains: filter.q, mode: "insensitive" } },
      {
        order: {
          is: { reference: { contains: filter.q, mode: "insensitive" } },
        },
      },
      {
        order: {
          is: { customerName: { contains: filter.q, mode: "insensitive" } },
        },
      },
      { order: { is: { customerPhone: { contains: filter.q } } } },
    ];
  }
  if (
    filter.status &&
    ALL_PAYMENT_STATUSES.includes(filter.status as PaymentStatus)
  ) {
    where.status = filter.status as PaymentStatus;
  }
  if (filter.partnerCode) {
    where.order = {
      is: { assignedPartnerCode: filter.partnerCode.toUpperCase() },
    };
  }

  const total = await db.payment.count({ where });
  const rows = await db.payment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      order: {
        select: {
          reference: true,
          customerName: true,
          customerPhone: true,
          assignedPartnerCode: true,
          status: true,
          totalPaise: true,
        },
      },
      verifiedBy: { select: { code: true } },
    },
  });

  return {
    rows,
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

function loadPaymentDetail(id: string) {
  return db.payment.findUniqueOrThrow({
    where: { id },
    include: {
      order: {
        include: {
          items: { orderBy: { productName: "asc" } },
          bill: { select: { id: true, billNumber: true, status: true } },
        },
      },
      verifiedBy: { select: { code: true, name: true } },
    },
  });
}

export async function getPaymentForConsole(raw: unknown) {
  await requirePermission("payments.view");
  const { id } = paymentIdSchema.parse(raw);
  try {
    return await loadPaymentDetail(id);
  } catch {
    throw new NotFoundError("That payment does not exist.");
  }
}

// ---------------------------------------------------------------------------
// Expired stock-hold sweep (cron)
// ---------------------------------------------------------------------------

export async function releaseExpiredHolds(): Promise<{ released: number }> {
  const now = new Date();
  const expired = await db.order.findMany({
    where: {
      status: "AWAITING_PAYMENT",
      holdExpiresAt: { lt: now },
    },
    include: { items: true, payments: true },
    take: 200,
  });

  let released = 0;
  for (const order of expired) {
    // Never auto-fail an order the customer has already claimed to have paid
    // (a SUBMITTED payment) or one that is verified — those need a human. Only
    // truly abandoned holds (no payment, or only an INITIATED stub) are swept.
    if (
      order.payments.some(
        (p) => p.status === "VERIFIED" || p.status === "SUBMITTED",
      )
    ) {
      continue;
    }
    const items: OrderItemLite[] = order.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
    }));
    await db.$transaction(async (tx) => {
      await releaseReservation(tx, items);
      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: "FAILED", status: "PAYMENT_FAILED" },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: "AWAITING_PAYMENT",
          toStatus: "PAYMENT_FAILED",
          reason: "Payment hold expired",
        },
      });
      await tx.payment.updateMany({
        where: {
          orderId: order.id,
          status: { in: ["INITIATED", "SUBMITTED"] },
        },
        data: { status: "FAILED" },
      });
      await recordAudit(
        { kind: "system" },
        {
          action: "order.hold_expired",
          summary: `Stock hold released for unpaid order ${order.reference}`,
          entityType: "Order",
          entityId: order.id,
          details: { reference: order.reference },
        },
        {},
        tx,
      );
    });
    released += 1;
  }
  return { released };
}
