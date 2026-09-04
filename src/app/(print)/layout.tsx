import type { Metadata } from "next";

/**
 * Print route group. These pages carry no console/storefront chrome — they are
 * opened in a new tab and sent straight to the printer. Each page still calls
 * `requireAuth` + `requirePermission` itself (this group is outside the
 * `(console)` auth gate).
 */
export const metadata: Metadata = {
  title: "Print",
  robots: { index: false, follow: false },
};

const printStyles = `
  @page { size: A4; margin: 12mm; }
  @media print {
    html, body { background: #fff !important; }
    .no-print { display: none !important; }
    .print-page { page-break-after: always; break-after: page; }
    .print-page:last-child { page-break-after: auto; break-after: auto; }
    .avoid-break { page-break-inside: avoid; break-inside: avoid; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr { page-break-inside: avoid; }
    a[href]::after { content: ""; }
  }
`;

export default function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-black">
      <style>{printStyles}</style>
      <div className="mx-auto max-w-4xl px-4 py-6 print:max-w-none print:p-0">
        {children}
      </div>
    </div>
  );
}
