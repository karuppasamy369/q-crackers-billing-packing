/**
 * India-specific helpers: GST state codes, phone normalisation, pincode
 * validation. Pure — no server imports.
 */

/** GST state code -> state / UT name. */
export const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "25": "Daman and Diu",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "28": "Andhra Pradesh (before division)",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
};

export function isValidStateCode(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(GST_STATE_CODES, code);
}

export function stateNameForCode(code: string): string | null {
  return GST_STATE_CODES[code] ?? null;
}

export function isValidPincode(value: string): boolean {
  return /^[1-9][0-9]{5}$/.test(value.trim());
}

/**
 * Normalise an Indian mobile number to `+91XXXXXXXXXX`.
 * Accepts inputs like "98765 43210", "+91-9876543210", "09876543210".
 * Returns null for anything that is not a valid 10-digit mobile (starts 6–9).
 */
export function normalizeIndianMobile(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  let local = digits;
  if (local.length === 12 && local.startsWith("91")) local = local.slice(2);
  else if (local.length === 11 && local.startsWith("0")) local = local.slice(1);
  if (!/^[6-9][0-9]{9}$/.test(local)) return null;
  return `+91${local}`;
}
