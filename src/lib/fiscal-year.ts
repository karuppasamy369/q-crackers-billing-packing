/**
 * Indian financial year (1 April – 31 March), identified by its starting
 * calendar year. A bill dated 15 Feb 2027 is still FY 2026.
 *
 * This is what drives the bill-number year segment: `PK-2026-0001`.
 */
export function indianFiscalYear(date: Date = new Date()): number {
  const month = date.getMonth(); // 0 = Jan
  const year = date.getFullYear();
  return month >= 3 ? year : year - 1;
}

/** e.g. 2026 -> "2026-27" for display on the invoice. */
export function fiscalYearLabel(startYear: number): string {
  const end = (startYear + 1) % 100;
  return `${startYear}-${end.toString().padStart(2, "0")}`;
}
