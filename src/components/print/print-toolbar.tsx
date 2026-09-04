"use client";

import { useEffect } from "react";

/**
 * A screen-only toolbar for the print pages. `autoPrint` opens the browser's
 * print dialog once after the page (and its QR images) have loaded.
 */
export function PrintToolbar({ autoPrint = false }: { autoPrint?: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const id = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(id);
  }, [autoPrint]);

  return (
    <div className="no-print mb-4 flex items-center gap-2 border-b border-gray-200 pb-3 text-sm">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-md bg-gray-900 px-3 py-1.5 font-semibold text-white hover:bg-gray-800"
      >
        🖨 Print
      </button>
      <button
        type="button"
        onClick={() => window.close()}
        className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50"
      >
        Close
      </button>
      <span className="text-xs text-gray-400">
        This page is print-only — use your browser’s print dialog (A4).
      </span>
    </div>
  );
}
