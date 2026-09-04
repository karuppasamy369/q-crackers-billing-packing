import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { requirePermission } from "@/server/rbac/authorize";
import { recordAudit } from "@/server/services/audit";
import { getRequestContext } from "@/server/http/request-context";
import { auditActor } from "@/server/services/_helpers";
import { ValidationError } from "@/server/http/errors";
import { getStorage } from "@/server/integrations/storage";
import { validateImageUpload } from "@/lib/image-validation";
import { env } from "@/env";
import { paymentAccountSchema } from "@/lib/validation/payment";

/**
 * A safe, public view of a partner's payment account — what checkout shows the
 * customer. Never exposes anything sensitive (there is nothing sensitive; the
 * VPA and payee name are meant to be shared to receive money).
 */
export type PublicPaymentAccount = {
  partnerCode: string;
  upiVpa: string | null;
  payeeName: string | null;
  instructions: string | null;
  hasStaticQr: boolean;
  isActive: boolean;
  /** Phase 10 — set once this partner has onboarded with a PSP for automatic
   *  verification. Null = still on the static-QR / manual-verify flow. */
  pspProvider: string | null;
};

async function ensureAccount(userId: string) {
  const existing = await db.partnerPaymentAccount.findUnique({
    where: { userId },
  });
  if (existing) return existing;
  return db.partnerPaymentAccount.create({ data: { userId } });
}

/** The signed-in partner's own account (created on first read). */
export async function getMyPaymentAccount() {
  const auth = await requirePermission("payments.account.manage");
  const account = await ensureAccount(auth.user.id);
  return { account, partnerCode: auth.user.code };
}

export async function updateMyPaymentAccount(raw: unknown) {
  const auth = await requirePermission("payments.account.manage");
  const input = paymentAccountSchema.parse(raw);
  const ctx = await getRequestContext();

  await ensureAccount(auth.user.id);
  const before = await db.partnerPaymentAccount.findUniqueOrThrow({
    where: { userId: auth.user.id },
  });

  const updated = await db.partnerPaymentAccount.update({
    where: { userId: auth.user.id },
    data: {
      upiVpa: input.upiVpa || null,
      payeeName: input.payeeName || null,
      instructions: input.instructions || null,
      isActive: input.isActive,
      pspProvider: input.pspProvider || null,
      pspAccountId: input.pspAccountId || null,
      updatedById: auth.user.id,
    },
  });

  await recordAudit(
    auditActor(auth),
    {
      action: "payment_account.update",
      summary: `${auth.user.code} updated their payment account`,
      entityType: "PartnerPaymentAccount",
      entityId: updated.id,
      details: {
        upiVpa: { from: before.upiVpa, to: updated.upiVpa },
        payeeName: { from: before.payeeName, to: updated.payeeName },
        isActive: { from: before.isActive, to: updated.isActive },
        pspProvider: { from: before.pspProvider, to: updated.pspProvider },
      },
    },
    ctx,
  );
  return updated;
}

/** Replace the uploaded static QR image for the signed-in partner. */
export async function setMyStaticQr(bytes: Uint8Array): Promise<void> {
  const auth = await requirePermission("payments.account.manage");
  const ctx = await getRequestContext();

  const check = validateImageUpload(bytes, env.STORAGE_MAX_IMAGE_BYTES);
  if (!check.ok) throw new ValidationError(check.error);

  const account = await ensureAccount(auth.user.id);
  const storage = getStorage();
  const key = `payment-qr/${randomUUID()}.${check.extension}`;
  await storage.put(key, bytes, check.contentType);

  const previous = account.staticQrStorageKey;
  await db.partnerPaymentAccount.update({
    where: { userId: auth.user.id },
    data: { staticQrStorageKey: key, updatedById: auth.user.id },
  });
  if (previous) await storage.delete(previous).catch(() => undefined);

  await recordAudit(
    auditActor(auth),
    {
      action: "payment_account.qr_upload",
      summary: `${auth.user.code} uploaded a static payment QR`,
      entityType: "PartnerPaymentAccount",
      entityId: account.id,
    },
    ctx,
  );
}

export async function removeMyStaticQr(): Promise<void> {
  const auth = await requirePermission("payments.account.manage");
  const ctx = await getRequestContext();
  const account = await db.partnerPaymentAccount.findUnique({
    where: { userId: auth.user.id },
  });
  if (!account?.staticQrStorageKey) return;
  await getStorage().delete(account.staticQrStorageKey).catch(() => undefined);
  await db.partnerPaymentAccount.update({
    where: { userId: auth.user.id },
    data: { staticQrStorageKey: null, updatedById: auth.user.id },
  });
  await recordAudit(
    auditActor(auth),
    {
      action: "payment_account.qr_remove",
      summary: `${auth.user.code} removed their static payment QR`,
      entityType: "PartnerPaymentAccount",
      entityId: account.id,
    },
    ctx,
  );
}

/**
 * Resolve a partner's public payment details by user id. No auth — used by
 * checkout to show the customer where to pay. Returns null if the partner has
 * no usable account.
 */
export async function getPublicPaymentAccountForPartner(
  partnerId: string,
): Promise<PublicPaymentAccount | null> {
  const account = await db.partnerPaymentAccount.findUnique({
    where: { userId: partnerId },
    include: { user: { select: { code: true, isActive: true } } },
  });
  if (!account || !account.user.isActive || !account.isActive) return null;
  return {
    partnerCode: account.user.code,
    upiVpa: account.upiVpa,
    payeeName: account.payeeName,
    instructions: account.instructions,
    hasStaticQr: Boolean(account.staticQrStorageKey),
    isActive: account.isActive,
    pspProvider: account.pspProvider,
  };
}

export async function loadStaticQrBytes(
  partnerId: string,
): Promise<{ data: Uint8Array; contentType: string } | null> {
  const account = await db.partnerPaymentAccount.findUnique({
    where: { userId: partnerId },
    include: { user: { select: { isActive: true } } },
  });
  if (!account?.staticQrStorageKey || !account.user.isActive) return null;
  const obj = await getStorage().get(account.staticQrStorageKey);
  return obj ? { data: obj.data, contentType: obj.contentType } : null;
}
