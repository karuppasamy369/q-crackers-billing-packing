import type { Dictionary } from "@/lib/i18n";

/** The order events that produce a customer WhatsApp message. */
export const NOTIFICATION_EVENT_TYPES = [
  "PAYMENT_RECEIVED",
  "ORDER_PACKED",
  "PARCEL_BOOKED",
  "LR_AVAILABLE",
  "REVIEW_REQUEST",
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

/** Meta-registered template names (must match the WhatsApp Business account). */
export const TEMPLATE_NAME: Record<NotificationEventType, string> = {
  PAYMENT_RECEIVED: "payment_received",
  ORDER_PACKED: "order_packed",
  PARCEL_BOOKED: "parcel_booked",
  LR_AVAILABLE: "lr_available",
  REVIEW_REQUEST: "review_request",
};

/** Everything a template can reference. Only customer-safe fields. */
export type TemplateData = {
  name: string;
  /** Bill number (`PK-2026-0001`) or the opaque tracking code (`QC-XXXXXXXX`). */
  orderNo: string;
  /** Formatted, e.g. "₹1,234.00". */
  amount: string;
  courier: string;
  lrNumber: string;
  parcels: string;
  /** Absolute tracking URL. */
  link: string;
};

/** The ordered params a Meta template body expects, per event. */
const PARAM_ORDER: Record<NotificationEventType, (keyof TemplateData)[]> = {
  PAYMENT_RECEIVED: ["name", "amount", "orderNo", "link"],
  ORDER_PACKED: ["name", "orderNo", "link"],
  PARCEL_BOOKED: ["name", "orderNo", "courier", "lrNumber", "parcels", "link"],
  LR_AVAILABLE: ["name", "orderNo", "lrNumber", "link"],
  REVIEW_REQUEST: ["name", "orderNo", "link"],
};

function dictKey(
  event: NotificationEventType,
): keyof Dictionary["notifications"] {
  switch (event) {
    case "PAYMENT_RECEIVED":
      return "paymentReceived";
    case "ORDER_PACKED":
      return "orderPacked";
    case "PARCEL_BOOKED":
      return "parcelBooked";
    case "LR_AVAILABLE":
      return "lrAvailable";
    case "REVIEW_REQUEST":
      return "reviewRequest";
  }
}

/** Replace every `{key}` with its value; throws if a placeholder is left over
 *  or a referenced key is missing (a template / data mismatch is a bug). */
export function interpolate(
  template: string,
  vars: Record<string, string>,
): string {
  const out = template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const value = vars[key];
    if (value === undefined) {
      throw new Error(`notification template: missing value for {${key}}`);
    }
    return value;
  });
  if (/\{[^}]+\}/.test(out)) {
    throw new Error("notification template: unresolved placeholder remains");
  }
  return out;
}

export type RenderedNotification = {
  templateName: string;
  templateParams: string[];
  body: string;
};

/**
 * Render one notification in the given locale's dictionary. Returns the plain
 * body (WhatsApp text / log / fallback) plus the template name + ordered params
 * for a template-based provider.
 */
export function renderNotification(
  event: NotificationEventType,
  data: TemplateData,
  dict: Dictionary,
): RenderedNotification {
  const template = dict.notifications[dictKey(event)];
  const vars = data as unknown as Record<string, string>;
  return {
    templateName: TEMPLATE_NAME[event],
    templateParams: PARAM_ORDER[event].map((k) => data[k]),
    body: interpolate(template, vars),
  };
}
