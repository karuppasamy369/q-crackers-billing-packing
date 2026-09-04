/**
 * Attribution cookie set by the `/s/<code>` partner order links.
 *
 * It is a readable partner login code, not a secret — the security property is
 * only "this browsing session came in through partner X's link". The order's
 * permanent `assignedPartnerId` is resolved and frozen server-side at checkout
 * (and a DB trigger blocks any later change).
 */
export const PARTNER_COOKIE = "qc_partner";

export const PARTNER_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
