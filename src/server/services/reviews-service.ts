import "server-only";

import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma";
import type { ReviewStatus } from "@/generated/prisma";
import { requirePermission } from "@/server/rbac/authorize";
import { recordAudit } from "@/server/services/audit";
import { getRequestContext } from "@/server/http/request-context";
import { auditActor } from "@/server/services/_helpers";
import { AppError, NotFoundError, ValidationError } from "@/server/http/errors";
import { rateLimit } from "@/lib/rate-limit";
import { getOrderIdForTrackingToken } from "@/server/services/tracking-service";
import {
  submitReviewSchema,
  moderateReviewSchema,
  reviewListFilterSchema,
} from "@/lib/validation/reviews";

const SUBMIT_RATE_MAX = 5;
const SUBMIT_RATE_WINDOW_MS = 10 * 60_000;
const PAGE_SIZE = 30;

/** Statuses from which a customer may review (parcel has been dispatched). */
const REVIEW_ELIGIBLE_STATUSES = ["PARCEL_BOOKED", "COMPLETED"] as const;

function givenName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  return first.slice(0, 40);
}

// ---------------------------------------------------------------------------
// Customer submission (public, tracking-token gated)
// ---------------------------------------------------------------------------

export async function submitReview(raw: unknown): Promise<{
  status: "submitted" | "already_reviewed";
}> {
  const ctx = await getRequestContext();
  const rl = rateLimit(
    `review:submit:${ctx.ip ?? "unknown"}`,
    SUBMIT_RATE_MAX,
    SUBMIT_RATE_WINDOW_MS,
  );
  if (!rl.allowed) {
    throw new AppError(
      "RATE_LIMITED",
      "Too many attempts. Please wait a few minutes and try again.",
    );
  }

  const parsed = submitReviewSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Please check your review and retry.",
    );
  }
  const input = parsed.data;

  // The token hash is the only credential — resolve the order through it.
  const orderId = await getOrderIdForTrackingToken(input.token);

  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      id: true,
      customerId: true,
      customerName: true,
      status: true,
      paymentStatus: true,
      review: { select: { id: true } },
    },
  });

  if (order.review) return { status: "already_reviewed" };

  if (
    order.paymentStatus !== "PAID" ||
    !(REVIEW_ELIGIBLE_STATUSES as readonly string[]).includes(order.status)
  ) {
    throw new AppError("CONFLICT", "This order is not ready for a review yet.");
  }

  const comment = input.comment ? input.comment : null;

  try {
    const created = await db.review.create({
      data: {
        orderId: order.id,
        customerId: order.customerId,
        rating: input.rating,
        comment,
        reviewerName: givenName(order.customerName),
      },
      select: { id: true },
    });

    await recordAudit(
      { kind: "system" },
      {
        action: "review.submit",
        summary: `Customer left a ${input.rating}★ review for order ${order.id}`,
        entityType: "Review",
        entityId: created.id,
        details: {
          orderId: order.id,
          rating: input.rating,
          hasComment: Boolean(comment),
        },
      },
      ctx,
    );
    return { status: "submitted" };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // A concurrent submission won the unique(orderId) race.
      return { status: "already_reviewed" };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Partner moderation (`reviews.moderate`)
// ---------------------------------------------------------------------------

export async function listReviews(raw: unknown) {
  await requirePermission("reviews.moderate");
  const filter = reviewListFilterSchema.parse(raw ?? {});

  const where: Prisma.ReviewWhereInput = {};
  if (filter.status) where.status = filter.status as ReviewStatus;
  if (filter.rating) where.rating = filter.rating;
  if (filter.q) {
    where.OR = [
      { comment: { contains: filter.q, mode: "insensitive" } },
      { reviewerName: { contains: filter.q, mode: "insensitive" } },
      {
        order: {
          is: { reference: { contains: filter.q, mode: "insensitive" } },
        },
      },
      {
        order: {
          is: {
            customerName: { contains: filter.q, mode: "insensitive" },
          },
        },
      },
      {
        order: {
          is: {
            bill: {
              is: { billNumber: { contains: filter.q, mode: "insensitive" } },
            },
          },
        },
      },
    ];
  }

  const [total, rows] = await Promise.all([
    db.review.count({ where }),
    db.review.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      skip: (filter.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        rating: true,
        comment: true,
        reviewerName: true,
        status: true,
        submittedAt: true,
        moderatedAt: true,
        moderationNote: true,
        order: {
          select: {
            id: true,
            city: true,
            stateName: true,
            bill: { select: { billNumber: true } },
          },
        },
        moderatedBy: { select: { code: true } },
      },
    }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      reviewerName: r.reviewerName,
      status: r.status,
      submittedAt: r.submittedAt,
      moderatedAt: r.moderatedAt,
      moderationNote: r.moderationNote,
      orderId: r.order.id,
      billNumber: r.order.bill?.billNumber ?? null,
      place: `${r.order.city}, ${r.order.stateName}`,
      moderatedByCode: r.moderatedBy?.code ?? null,
    })),
    total,
    page: filter.page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getReviewStats() {
  await requirePermission("reviews.moderate");
  const [agg, published, hidden, byRating] = await Promise.all([
    db.review.aggregate({ _avg: { rating: true }, _count: true }),
    db.review.count({ where: { status: "PUBLISHED" } }),
    db.review.count({ where: { status: "HIDDEN" } }),
    db.review.groupBy({ by: ["rating"], _count: true }),
  ]);
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of byRating) distribution[r.rating] = r._count;
  return {
    total: agg._count,
    published,
    hidden,
    average: agg._avg.rating ? Number(agg._avg.rating.toFixed(2)) : null,
    distribution,
  };
}

export async function moderateReview(raw: unknown): Promise<void> {
  const auth = await requirePermission("reviews.moderate");
  const input = moderateReviewSchema.parse(raw);
  const ctx = await getRequestContext();

  const review = await db.review.findUnique({
    where: { id: input.id },
    select: { id: true, orderId: true, rating: true, status: true },
  });
  if (!review) throw new NotFoundError("That review does not exist.");

  if (input.action === "delete") {
    await db.review.delete({ where: { id: review.id } });
    await recordAudit(
      auditActor(auth),
      {
        action: "review.delete",
        summary: `${auth.user.code} deleted a ${review.rating}★ review for order ${review.orderId}`,
        entityType: "Review",
        entityId: review.id,
        details: { orderId: review.orderId, reason: input.note || null },
      },
      ctx,
    );
    return;
  }

  const status: ReviewStatus = input.action === "hide" ? "HIDDEN" : "PUBLISHED";
  if (review.status === status) return;

  await db.review.update({
    where: { id: review.id },
    data: {
      status,
      moderatedById: auth.user.id,
      moderatedAt: new Date(),
      moderationNote: input.note || null,
    },
  });
  await recordAudit(
    auditActor(auth),
    {
      action: input.action === "hide" ? "review.hide" : "review.publish",
      summary: `${auth.user.code} ${input.action === "hide" ? "hid" : "re-published"} a review for order ${review.orderId}`,
      entityType: "Review",
      entityId: review.id,
      details: { orderId: review.orderId, reason: input.note || null },
    },
    ctx,
  );
}

/** Compact review info for the order-detail page (`orders.view`). */
export async function getReviewForOrder(orderId: string) {
  await requirePermission("orders.view");
  const r = await db.review.findUnique({
    where: { orderId },
    select: {
      id: true,
      rating: true,
      comment: true,
      status: true,
      submittedAt: true,
    },
  });
  return r;
}
