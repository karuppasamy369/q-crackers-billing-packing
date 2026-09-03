/**
 * Bill-number formatting. Format: `<CODE>-<FISCAL_YEAR>-<SEQ4>`
 *   PK-2026-0001, PSR-2026-0001, KA-2026-0001, S1-2026-0001, S2-2026-0001
 *
 * The sequence is per (code, fiscalYear); allocation happens server-side in a
 * transaction (see billing-service). This module is pure formatting only.
 */
export const BILL_CODE_RE = /^[A-Z][A-Z0-9]{1,9}$/;

export function isValidBillCode(code: string): boolean {
  return BILL_CODE_RE.test(code);
}

export function formatBillNumber(
  code: string,
  fiscalYear: number,
  sequenceNo: number,
): string {
  if (!isValidBillCode(code)) {
    throw new Error(`Invalid bill code: ${code}`);
  }
  if (!Number.isInteger(sequenceNo) || sequenceNo < 1) {
    throw new Error(`Invalid bill sequence: ${sequenceNo}`);
  }
  const seq = sequenceNo.toString().padStart(4, "0");
  return `${code}-${fiscalYear}-${seq}`;
}

export type ParsedBillNumber = {
  code: string;
  fiscalYear: number;
  sequenceNo: number;
};

export function parseBillNumber(value: string): ParsedBillNumber | null {
  const m = /^([A-Z][A-Z0-9]{1,9})-(\d{4})-(\d{4,})$/.exec(value.trim());
  if (!m) return null;
  return {
    code: m[1]!,
    fiscalYear: Number(m[2]),
    sequenceNo: Number(m[3]),
  };
}
