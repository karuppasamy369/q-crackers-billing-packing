import { NextResponse, type NextRequest } from "next/server";

import { getReadyToBookForReport } from "@/server/services/booking-service";
import { isAppError } from "@/server/http/errors";
import { toCsv } from "@/lib/csv";
import { formatPaise } from "@/lib/money";

/**
 * CSV export of the Ready to Book set, honouring the same filters as the
 * on-screen table and the consolidated print report. Permission is enforced
 * inside `getReadyToBookForReport` (`booking.view`) — this route adds nothing
 * on top, so an unauthenticated / unauthorised request gets the same 401/403
 * the console pages give.
 */
export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());

  let data;
  try {
    data = await getReadyToBookForReport(params);
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(
        { error: err.publicMessage },
        { status: err.httpStatus },
      );
    }
    throw err;
  }

  const headers = [
    "Bill No",
    "Order No",
    "Order Date",
    "Customer",
    "Mobile",
    "City",
    "State",
    "Pincode",
    "Courier / Transport",
    "Parcels",
    "Items",
    "Amount",
    "Packed At",
    "Status",
  ];
  const rows = data.rows.map((r) => [
    r.billNumber,
    r.orderRef,
    r.placedAt.toISOString().slice(0, 10),
    r.customerName,
    r.mobileMasked,
    r.city,
    r.stateName,
    r.pincode,
    r.courierName,
    r.parcelCount,
    r.itemCount,
    formatPaise(r.totalPaise),
    r.packedAt ? r.packedAt.toISOString() : "",
    r.status,
  ]);

  const csv = toCsv(headers, rows);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ready-to-book-${stamp}.csv"`,
    },
  });
}
