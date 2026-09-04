"use client";

import Link from "next/link";
import { useState } from "react";
import { formatPaise } from "@/lib/money";

export type ReadyRowDto = {
  id: string;
  billNumber: string | null;
  orderRef: string;
  placedAt: string;
  packedAt: string | null;
  customerName: string;
  mobileMasked: string;
  city: string;
  stateName: string;
  pincode: string;
  courierName: string | null;
  parcelCount: number;
  itemCount: number;
  totalPaise: number;
  status: string;
};

/**
 * The Ready to Book table with an optional multi-select for bulk cover
 * printing. Selection is presentation-only client state — it drives the
 * `?ids=` query string on `/print/covers` and never mutates anything, so it
 * carries none of the risk a bulk *booking* action would.
 */
export function ReadyToBookTable({
  rows,
  canBookParcel,
}: {
  rows: ReadyRowDto[];
  canBookParcel: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allChecked = rows.length > 0 && selected.size === rows.length;
  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const printSelectedHref =
    selected.size > 0
      ? `/print/covers?ids=${[...selected].join(",")}`
      : undefined;

  return (
    <div>
      <div className="no-print flex items-center justify-between border-b border-gray-200 p-3 text-sm">
        <span className="text-gray-500">
          {selected.size > 0
            ? `${selected.size} selected`
            : "Select rows to print covers in bulk."}
        </span>
        {printSelectedHref ? (
          <a
            href={printSelectedHref}
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-gray-900 px-3 py-1.5 font-semibold text-white hover:bg-gray-800"
          >
            🖨 Print Selected Covers
          </a>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="px-3 py-3">Bill No</th>
              <th className="px-3 py-3">Order No</th>
              <th className="px-3 py-3">Placed</th>
              <th className="px-3 py-3">Customer</th>
              <th className="px-3 py-3">Mobile</th>
              <th className="px-3 py-3">Destination</th>
              <th className="px-3 py-3">Courier</th>
              <th className="px-3 py-3 text-right">Parcels</th>
              <th className="px-3 py-3 text-right">Items</th>
              <th className="px-3 py-3 text-right">Amount</th>
              <th className="px-3 py-3">Packed</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 last:border-0">
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggleOne(r.id)}
                    aria-label={`Select order ${r.orderRef}`}
                  />
                </td>
                <td className="px-3 py-3 font-mono text-xs">
                  {r.billNumber ?? "—"}
                </td>
                <td className="px-3 py-3 font-mono text-xs">{r.orderRef}</td>
                <td className="px-3 py-3 whitespace-nowrap text-gray-500">
                  {new Date(r.placedAt).toLocaleDateString()}
                </td>
                <td className="px-3 py-3">{r.customerName}</td>
                <td className="px-3 py-3 text-xs text-gray-500">
                  {r.mobileMasked}
                </td>
                <td className="px-3 py-3 text-gray-600">
                  {r.city}, {r.stateName} — {r.pincode}
                </td>
                <td className="px-3 py-3">{r.courierName ?? "—"}</td>
                <td className="px-3 py-3 text-right">{r.parcelCount}</td>
                <td className="px-3 py-3 text-right">{r.itemCount}</td>
                <td className="px-3 py-3 text-right">
                  {formatPaise(r.totalPaise)}
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500">
                  {r.packedAt ? new Date(r.packedAt).toLocaleString() : "—"}
                </td>
                <td className="px-3 py-3">
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                    {r.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-xs whitespace-nowrap">
                  <Link
                    href={`/app/booking/${r.id}`}
                    className="text-gray-700 underline hover:text-gray-900"
                  >
                    View
                  </Link>
                  {" · "}
                  <a
                    href={`/print/cover/${r.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-gray-700 underline hover:text-gray-900"
                  >
                    Print Cover
                  </a>
                  {canBookParcel ? (
                    <>
                      {" · "}
                      <Link
                        href={`/app/booking/${r.id}`}
                        className="text-gray-700 underline hover:text-gray-900"
                      >
                        Book Parcel
                      </Link>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-4 py-8 text-center text-gray-400">
                  No orders are ready to book right now.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
