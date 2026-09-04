/**
 * Minimal RFC-4180 CSV serialiser — no dependency. A UTF-8 BOM is prepended so
 * Excel opens the file with the right encoding.
 */
export type CsvCell = string | number | null | undefined;

const BOM = "﻿";

function escapeCell(value: CsvCell): string {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(","));
  return BOM + lines.join("\r\n") + "\r\n";
}
