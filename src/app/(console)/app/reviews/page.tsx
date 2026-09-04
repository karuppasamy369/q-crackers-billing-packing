import Link from "next/link";
import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { listReviews, getReviewStats } from "@/server/services/reviews-service";
import { PageHeader, Card, StatTile, Forbidden } from "@/components/console/ui";
import { ReviewRowActions } from "./review-row-actions";

function Stars({ n }: { n: number }) {
  return (
    <span className="text-amber-500" aria-label={`${n} stars`}>
      {"★".repeat(n)}
      <span className="text-gray-300">{"★".repeat(5 - n)}</span>
    </span>
  );
}

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    rating?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth, "reviews.moderate")) return <Forbidden />;

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [result, stats] = await Promise.all([
    listReviews({
      status: sp.status,
      rating: sp.rating,
      q: sp.q,
      page,
    }),
    getReviewStats(),
  ]);

  const mkPage = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v) params.set(k, v);
    params.set("page", String(p));
    return `/app/reviews?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer reviews"
        description="Ratings and comments customers left after their parcel was dispatched. Hide a review to remove it from any public listing; delete it to remove it entirely."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile
          label="Average rating"
          value={stats.average ? `${stats.average} ★` : "—"}
        />
        <StatTile label="Total reviews" value={stats.total} />
        <StatTile label="Published" value={stats.published} />
        <StatTile label="Hidden" value={stats.hidden} />
      </div>

      <Card className="p-0">
        <form className="flex flex-wrap gap-2 border-b border-gray-200 p-3 text-sm">
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Comment / name / order ref / bill no."
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
          <select
            name="rating"
            defaultValue={sp.rating ?? ""}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          >
            <option value="">Any rating</option>
            {[5, 4, 3, 2, 1].map((r) => (
              <option key={r} value={r}>
                {r} ★
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={sp.status ?? ""}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          >
            <option value="">Any status</option>
            <option value="PUBLISHED">Published</option>
            <option value="HIDDEN">Hidden</option>
          </select>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-3 py-1.5 font-semibold text-white"
          >
            Filter
          </button>
          <Link
            href="/app/reviews"
            className="rounded-md border border-gray-300 px-3 py-1.5"
          >
            Clear
          </Link>
        </form>

        <ul className="divide-y divide-gray-100">
          {result.rows.map((r) => (
            <li key={r.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <Stars n={r.rating} />
                    <span className="font-medium">
                      {r.reviewerName ?? "Customer"}
                    </span>
                    <span className="text-xs text-gray-400">{r.place}</span>
                    {r.status === "HIDDEN" ? (
                      <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600">
                        hidden
                      </span>
                    ) : null}
                  </div>
                  {r.comment ? (
                    <p className="mt-1 whitespace-pre-line text-sm text-gray-700">
                      {r.comment}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-gray-400">(no comment)</p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    {new Date(r.submittedAt).toLocaleString()}
                    {r.billNumber ? (
                      <>
                        {" · "}
                        <Link
                          href={`/app/orders/${r.orderId}`}
                          className="underline hover:text-gray-700"
                        >
                          {r.billNumber}
                        </Link>
                      </>
                    ) : (
                      <>
                        {" · "}
                        <Link
                          href={`/app/orders/${r.orderId}`}
                          className="underline hover:text-gray-700"
                        >
                          order
                        </Link>
                      </>
                    )}
                    {r.moderatedByCode
                      ? ` · moderated by ${r.moderatedByCode}`
                      : ""}
                  </p>
                </div>
                <ReviewRowActions id={r.id} status={r.status} />
              </div>
            </li>
          ))}
          {result.rows.length === 0 ? (
            <li className="p-8 text-center text-sm text-gray-400">
              No reviews match.
            </li>
          ) : null}
        </ul>
      </Card>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          {result.total} review{result.total === 1 ? "" : "s"} · page{" "}
          {result.page} of {result.pageCount}
        </span>
        <span className="flex gap-2">
          {result.page > 1 ? (
            <Link href={mkPage(result.page - 1)} className="underline">
              ← Prev
            </Link>
          ) : null}
          {result.page < result.pageCount ? (
            <Link href={mkPage(result.page + 1)} className="underline">
              Next →
            </Link>
          ) : null}
        </span>
      </div>
    </div>
  );
}
