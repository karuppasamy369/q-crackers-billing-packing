import "server-only";

import { db } from "@/server/db";
import type { Prisma, OrderStatus } from "@/generated/prisma";
import { requirePermission } from "@/server/rbac/authorize";
import { recordAudit } from "@/server/services/audit";
import { getRequestContext } from "@/server/http/request-context";
import { getEffectiveSettings } from "@/server/services/settings-service";
import { quoteCart } from "@/server/services/pricing-service";
import { AppError, NotFoundError, ValidationError } from "@/server/http/errors";
import { generateRandomToken } from "@/server/auth/tokens";
import { rateLimit } from "@/lib/rate-limit";
import { formatPaise } from "@/lib/money";
import { normalizeIndianMobile, stateNameForCode } from "@/lib/india";
import {
  checkoutSchema,
  orderReferenceSchema,
} from "@/lib/validation/checkout";

const ORDER_HOLD_MINUTES = 30;
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT_MAX = 8;

export type CreateOrderResult = {
  reference: string;
  totalPaise: number;
};

/**
 * Create an online order. Nothing the browser sent about price, tax or totals
 * is trusted — the cart is re-quoted from the database, and everything is
 * written in one transaction that also reserves stock.
 */
export async function createOnlineOrder(
  raw: unknown,
): Promise<CreateOrderResult> {
  const ctx = await getRequestContext();

  const rl = rateLimit(
    `order:create:${ctx.ip ?? "unknown"}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
  );
  if (!rl.allowed) {
    throw new AppError(
      "RATE_LIMITED",
      "Too many orders from this connection. Please wait a few minutes and try again.",
    );
  }

  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Please check the form and try again.",
    );
  }
  const { items, customer } = parsed.data;

  const phoneNormalized = normalizeIndianMobile(customer.phone);
  if (!phoneNormalized) {
    throw new ValidationError("Enter a valid 10-digit Indian mobile number.");
  }
  const stateName = stateNameForCode(customer.stateCode);
  if (!stateName) throw new ValidationError("Choose your state.");

  // --- Fulfilment restrictions (settings-driven) ------------------------
  const settings = await getEffectiveSettings();
  const blocked = settings["fulfilment.blockedPincodes"];
  const serviceable = settings["fulfilment.serviceableStateCodes"];
  if (blocked.includes(customer.pincode)) {
    throw new ValidationError(
      "We are currently unable to deliver to this pincode.",
    );
  }
  if (serviceable.length > 0 && !serviceable.includes(customer.stateCode)) {
    throw new ValidationError(
      `We are currently unable to deliver to ${stateName}.`,
    );
  }

  // --- Server-authoritative quote --------------------------------------
  const quote = await quoteCart(items);
  if (!quote.fulfillable || quote.lines.length === 0) {
    const first = quote.issues[0];
    throw new ValidationError(
      first?.message ??
        "Some items in your cart are unavailable. Please review your cart.",
    );
  }
  if (
    quote.minOrderValuePaise > 0 &&
    quote.totalPaise < quote.minOrderValuePaise
  ) {
    throw new ValidationError(
      `The minimum order value is ${formatPaise(quote.minOrderValuePaise)}.`,
    );
  }

  const productIds = quote.lines.map((l) => l.productId).sort();
  const reference = generateRandomToken(24);

  const order = await db.$transaction(async (tx) => {
    // Lock every inventory row we are about to touch, in a stable order, so
    // two concurrent checkouts for the same product cannot both succeed.
    for (const id of productIds) {
      await tx.$queryRaw`SELECT 1 FROM "inventory" WHERE "productId" = ${id}::uuid FOR UPDATE`;
    }

    const invRows = await tx.inventory.findMany({
      where: { productId: { in: productIds } },
    });
    const invByProduct = new Map(invRows.map((r) => [r.productId, r]));

    for (const line of quote.lines) {
      const inv = invByProduct.get(line.productId);
      const available =
        (inv?.quantityOnHand ?? 0) - (inv?.quantityReserved ?? 0);
      if (line.quantity > available) {
        throw new ValidationError(
          available <= 0
            ? `${line.name} just went out of stock.`
            : `Only ${available} of ${line.name} remain.`,
        );
      }
    }

    for (const line of quote.lines) {
      await tx.inventory.update({
        where: { productId: line.productId },
        data: { quantityReserved: { increment: line.quantity } },
      });
    }

    const existingCustomer = await tx.customer.findFirst({
      where: { phoneNormalized },
    });
    const customerRow = existingCustomer
      ? await tx.customer.update({
          where: { id: existingCustomer.id },
          data: {
            name: customer.name,
            email: customer.email || existingCustomer.email,
          },
        })
      : await tx.customer.create({
          data: {
            name: customer.name,
            phone: customer.phone,
            phoneNormalized,
            email: customer.email || null,
          },
        });

    const created = await tx.order.create({
      data: {
        reference,
        customerId: customerRow.id,
        status: "AWAITING_PAYMENT",
        paymentStatus: "PENDING",
        source: "ONLINE",
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email || null,
        addressLine1: customer.addressLine1,
        addressLine2: customer.addressLine2 || null,
        city: customer.city,
        stateCode: customer.stateCode,
        stateName,
        pincode: customer.pincode,
        subtotalPaise: quote.subtotalPaise,
        discountPaise: 0,
        taxPaise: quote.taxPaise,
        shippingPaise: quote.shippingPaise,
        totalPaise: quote.totalPaise,
        pricesIncludeGst: quote.pricesIncludeGst,
        shippingMode: settings["shipping.mode"],
        holdExpiresAt: new Date(Date.now() + ORDER_HOLD_MINUTES * 60_000),
        items: {
          create: quote.lines.map((l) => ({
            productId: l.productId,
            sku: l.sku,
            productName: l.name,
            unitPricePaise: l.unitPricePaise,
            gstRateBp: l.gstRateBp,
            quantity: l.quantity,
            lineSubtotalPaise: l.lineSubtotalPaise,
            lineTaxPaise: l.lineTaxPaise,
            lineTotalPaise: l.lineTotalPaise,
          })),
        },
        history: {
          create: { toStatus: "AWAITING_PAYMENT", reason: "Order placed" },
        },
      },
    });

    await recordAudit(
      { kind: "system" },
      {
        action: "order.create",
        summary: `Online order ${reference} placed — ${formatPaise(quote.totalPaise)}`,
        entityType: "Order",
        entityId: created.id,
        details: {
          reference,
          totalPaise: quote.totalPaise,
          itemCount: quote.lines.length,
          reserved: quote.lines.map((l) => ({ sku: l.sku, qty: l.quantity })),
          customerPhone: phoneNormalized,
          pincode: customer.pincode,
        },
      },
      ctx,
      tx,
    );

    return created;
  });

  return { reference: order.reference, totalPaise: order.totalPaise };
}

// ---------------------------------------------------------------------------
// Customer-facing read (capability = knowing the random reference)
// ---------------------------------------------------------------------------

export async function getOrderByReference(rawRef: string) {
  const ref = orderReferenceSchema.safeParse(rawRef);
  if (!ref.success) throw new NotFoundError("Order not found.");

  const order = await db.order.findUnique({
    where: { reference: ref.data },
    include: { items: { orderBy: { productName: "asc" } } },
  });
  if (!order) throw new NotFoundError("Order not found.");

  return {
    reference: order.reference,
    status: order.status,
    paymentStatus: order.paymentStatus,
    placedAt: order.placedAt,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    address: {
      line1: order.addressLine1,
      line2: order.addressLine2,
      city: order.city,
      state: order.stateName,
      pincode: order.pincode,
    },
    items: order.items.map((i) => ({
      name: i.productName,
      quantity: i.quantity,
      unitPricePaise: i.unitPricePaise,
      lineTotalPaise: i.lineTotalPaise,
    })),
    subtotalPaise: order.subtotalPaise,
    taxPaise: order.taxPaise,
    shippingPaise: order.shippingPaise,
    totalPaise: order.totalPaise,
    pricesIncludeGst: order.pricesIncludeGst,
  };
}

// ---------------------------------------------------------------------------
// Internal console (read-only in Phase 3)
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

export async function listOrders(
  filter: {
    q?: string;
    status?: string;
    page?: number;
  } = {},
) {
  await requirePermission("orders.view");
  const page = Math.max(1, Math.floor(filter.page ?? 1));

  const where: Prisma.OrderWhereInput = {};
  if (filter.q) {
    where.OR = [
      { reference: { contains: filter.q, mode: "insensitive" } },
      { customerName: { contains: filter.q, mode: "insensitive" } },
      { customerPhone: { contains: filter.q } },
    ];
  }
  if (filter.status && isOrderStatus(filter.status)) {
    where.status = filter.status;
  }

  const total = await db.order.count({ where });
  const rows = await db.order.findMany({
    where,
    orderBy: { placedAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: { _count: { select: { items: true } } },
  });

  return {
    rows,
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getOrderForConsole(id: string) {
  await requirePermission("orders.view");
  const order = await db.order.findUnique({
    where: { id },
    include: {
      items: { orderBy: { productName: "asc" } },
      history: {
        orderBy: { createdAt: "asc" },
        include: { changedBy: { select: { code: true } } },
      },
      customer: { select: { id: true, phoneNormalized: true } },
    },
  });
  if (!order) throw new NotFoundError("That order does not exist.");
  return order;
}

const ORDER_STATUSES: OrderStatus[] = [
  "AWAITING_PAYMENT",
  "PAYMENT_FAILED",
  "PAID",
  "PACKED",
  "PARCEL_BOOKED",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
];

function isOrderStatus(v: string): v is OrderStatus {
  return (ORDER_STATUSES as string[]).includes(v);
}

export { ORDER_STATUSES };
