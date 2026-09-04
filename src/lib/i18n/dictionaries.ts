import type { Locale } from "@/lib/settings/registry";

/**
 * Storefront copy. English and Tamil are both first-class. Keep keys flat and
 * stable; translators only touch the values. (i18n.test.ts checks that `en` and
 * `ta` have exactly the same key structure.)
 */
export type Dictionary = {
  localeName: string;
  siteName: string;
  tagline: string;
  nav: {
    allProducts: string;
    categories: string;
    cart: string;
  };
  listing: {
    heading: string;
    inCategory: string;
    empty: string;
    backToAll: string;
    page: string;
  };
  product: {
    description: string;
    category: string;
    mrp: string;
    inclusiveGst: string;
    plusGst: string;
    notFound: string;
    addToCart: string;
    added: string;
    outOfStock: string;
  };
  cart: {
    title: string;
    empty: string;
    continueShopping: string;
    quantity: string;
    remove: string;
    each: string;
    subtotal: string;
    tax: string;
    shipping: string;
    free: string;
    total: string;
    proceed: string;
    fixIssues: string;
    minOrder: string;
  };
  checkout: {
    title: string;
    backToCart: string;
    contactHeading: string;
    deliveryHeading: string;
    name: string;
    phone: string;
    email: string;
    emailOptional: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    selectState: string;
    pincode: string;
    summary: string;
    placeOrder: string;
    paymentNote: string;
  };
  payment: {
    title: string;
    amountDue: string;
    payTo: string;
    scanQr: string;
    openUpiApp: string;
    orderRef: string;
    instructionsHeading: string;
    afterPaying: string;
    utrLabel: string;
    utrHelp: string;
    payerNameOptional: string;
    payerVpaOptional: string;
    submit: string;
    submitting: string;
    verifyingTitle: string;
    verifyingBody: string;
    paidTitle: string;
    paidBody: string;
    failedTitle: string;
    failedBody: string;
    noAccount: string;
    viewOrder: string;
    error: string;
  };
  confirmation: {
    title: string;
    thanks: string;
    reference: string;
    status: string;
    paymentPending: string;
    paymentVerifying: string;
    paymentPaid: string;
    paymentFailed: string;
    contactNote: string;
    deliverTo: string;
    items: string;
    notFound: string;
  };
  tracking: {
    title: string;
    refLabel: string;
    statusPaid: string;
    statusPacked: string;
    statusParcelBooked: string;
    statusCompleted: string;
    statusCancelled: string;
    bannerPreparing: string;
    bannerDispatched: string;
    bannerCompleted: string;
    bannerCancelled: string;
    stagePayment: string;
    stagePacked: string;
    stageParcelBooked: string;
    stageLrAvailable: string;
    stageReview: string;
    stateCurrent: string;
    statePending: string;
    courier: string;
    lrNumber: string;
    bookingDate: string;
    parcelCount: string;
    destination: string;
    items: string;
    downloadLr: string;
    lrPending: string;
    reviewPending: string;
    cancelledNote: string;
    invalidTitle: string;
    invalidBody: string;
    contactNote: string;
    shareTitle: string;
    shareHint: string;
    shareReveal: string;
    shareRefresh: string;
    shareCopy: string;
    shareCopied: string;
  };
  /**
   * WhatsApp notification message templates. `{name}` `{orderNo}` `{amount}`
   * `{courier}` `{lrNumber}` `{parcels}` `{link}` are filled in per order.
   */
  notifications: {
    paymentReceived: string;
    orderPacked: string;
    parcelBooked: string;
    lrAvailable: string;
    reviewRequest: string;
  };
  footer: {
    contact: string;
    rights: string;
  };
  language: string;
};

const en: Dictionary = {
  localeName: "English",
  siteName: "Q Crackers",
  tagline: "Fireworks & crackers, delivered.",
  nav: { allProducts: "All products", categories: "Categories", cart: "Cart" },
  listing: {
    heading: "Products",
    inCategory: "Category",
    empty: "No products to show yet. Please check back soon.",
    backToAll: "← Back to all products",
    page: "Page",
  },
  product: {
    description: "Description",
    category: "Category",
    mrp: "MRP",
    inclusiveGst: "Price includes GST",
    plusGst: "GST extra at checkout",
    notFound: "This product is not available.",
    addToCart: "Add to cart",
    added: "Added ✓",
    outOfStock: "Out of stock",
  },
  cart: {
    title: "Your cart",
    empty: "Your cart is empty.",
    continueShopping: "← Continue shopping",
    quantity: "Qty",
    remove: "Remove",
    each: "each",
    subtotal: "Subtotal",
    tax: "GST",
    shipping: "Shipping",
    free: "Free",
    total: "Total",
    proceed: "Proceed to checkout",
    fixIssues: "Please fix the items above before checking out.",
    minOrder: "Minimum order value not met.",
  },
  checkout: {
    title: "Checkout",
    backToCart: "← Back to cart",
    contactHeading: "Contact details",
    deliveryHeading: "Delivery address",
    name: "Full name",
    phone: "Mobile number",
    email: "Email",
    emailOptional: "Email (optional)",
    addressLine1: "Address line 1",
    addressLine2: "Address line 2 (optional)",
    city: "City / town",
    state: "State",
    selectState: "Select your state",
    pincode: "Pincode",
    summary: "Order summary",
    placeOrder: "Place order",
    paymentNote:
      "Next you will pay by UPI (GPay / PhonePe / Paytm). Nothing is charged automatically — you enter your transaction ID and we verify it before confirming your order.",
  },
  payment: {
    title: "Pay for your order",
    amountDue: "Amount to pay",
    payTo: "Pay to",
    scanQr: "Scan this QR code with any UPI app",
    openUpiApp: "Open UPI app",
    orderRef: "Order reference",
    instructionsHeading: "Payment instructions",
    afterPaying:
      "After paying, enter your UPI transaction ID / UTR below so we can verify it.",
    utrLabel: "UPI transaction ID / UTR",
    utrHelp:
      "The 12-digit reference shown in your UPI app after the payment succeeds.",
    payerNameOptional: "Name on the paying account (optional)",
    payerVpaOptional: "Your UPI ID (optional)",
    submit: "I have paid — submit for verification",
    submitting: "Submitting…",
    verifyingTitle: "Payment received — being verified",
    verifyingBody:
      "We have your transaction ID and are verifying the payment. Your order is confirmed once verification is complete. We will contact you on your mobile number if anything else is needed.",
    paidTitle: "Payment confirmed",
    paidBody: "Your payment has been verified. Thank you!",
    failedTitle: "Payment not confirmed",
    failedBody:
      "This order's payment could not be confirmed and the stock hold has been released. Please place a new order or contact us.",
    noAccount:
      "Online payment details are not available for this order. We will contact you on your mobile number to arrange payment.",
    viewOrder: "View order details",
    error: "We could not record your payment. Please try again.",
  },
  confirmation: {
    title: "Order received",
    thanks: "Thank you! Your order has been received.",
    reference: "Order reference",
    status: "Status",
    paymentPending: "Awaiting payment",
    paymentVerifying: "Payment being verified",
    paymentPaid: "Payment confirmed",
    paymentFailed: "Payment not confirmed",
    contactNote:
      "We will contact you on your mobile number to confirm dispatch.",
    deliverTo: "Deliver to",
    items: "Items",
    notFound: "We could not find that order.",
  },
  tracking: {
    title: "Track your order",
    refLabel: "Order",
    statusPaid: "Payment confirmed",
    statusPacked: "Packed",
    statusParcelBooked: "Handed to courier",
    statusCompleted: "Delivered",
    statusCancelled: "Cancelled",
    bannerPreparing: "Your order is being prepared for dispatch.",
    bannerDispatched: "Your parcel is on its way.",
    bannerCompleted: "Your order has been delivered.",
    bannerCancelled: "This order was cancelled.",
    stagePayment: "Payment received",
    stagePacked: "Order packed",
    stageParcelBooked: "Parcel booked",
    stageLrAvailable: "LR copy available",
    stageReview: "Review",
    stateCurrent: "In progress",
    statePending: "Pending",
    courier: "Courier / transport",
    lrNumber: "LR / parcel number",
    bookingDate: "Booking date",
    parcelCount: "Number of parcels",
    destination: "Destination",
    items: "Items",
    downloadLr: "Download LR copy",
    lrPending:
      "The LR copy will appear here once your parcel has been booked with the courier.",
    reviewPending: "You can leave a review once your order is delivered.",
    cancelledNote:
      "If you have any questions about this cancellation, please contact us.",
    invalidTitle: "This tracking link is not valid",
    invalidBody:
      "The link may be incorrect, expired, or no longer active. Please check the link you were given, or contact us for help.",
    contactNote:
      "For any help with your order, contact us on the number on our website.",
    shareTitle: "Shareable tracking link",
    shareHint:
      "Safe to forward — it shows only delivery progress, not your address or contact details.",
    shareReveal: "Show tracking link",
    shareRefresh: "Get a new link",
    shareCopy: "Copy",
    shareCopied: "Copied",
  },
  notifications: {
    paymentReceived:
      "Q Crackers: Hi {name}, we have received your payment of {amount} for order {orderNo}. Your order is confirmed and we will pack it soon. Track it any time here: {link}",
    orderPacked:
      "Q Crackers: Hi {name}, order {orderNo} has been packed and is ready for dispatch. Track it here: {link}",
    parcelBooked:
      "Q Crackers: Hi {name}, order {orderNo} has been handed to {courier} (LR number {lrNumber}, {parcels} parcel(s)). Track it here: {link}",
    lrAvailable:
      "Q Crackers: Hi {name}, the LR copy for order {orderNo} (LR number {lrNumber}) is now available. You can download it from your tracking page: {link}",
    reviewRequest:
      "Q Crackers: Hi {name}, we hope you enjoyed your order {orderNo}. If you have a moment, we would love your feedback: {link}",
  },
  footer: {
    contact: "Contact",
    rights: "All rights reserved.",
  },
  language: "Language",
};

const ta: Dictionary = {
  localeName: "தமிழ்",
  siteName: "Q Crackers",
  tagline: "பட்டாசுகள் உங்கள் வீட்டிற்கே.",
  nav: {
    allProducts: "அனைத்து பொருட்கள்",
    categories: "வகைகள்",
    cart: "கூடை",
  },
  listing: {
    heading: "பொருட்கள்",
    inCategory: "வகை",
    empty: "இப்போது பொருட்கள் எதுவும் இல்லை. விரைவில் மீண்டும் பார்க்கவும்.",
    backToAll: "← அனைத்து பொருட்களுக்கும் திரும்பு",
    page: "பக்கம்",
  },
  product: {
    description: "விவரம்",
    category: "வகை",
    mrp: "அதிகபட்ச விலை",
    inclusiveGst: "விலையில் GST சேர்க்கப்பட்டுள்ளது",
    plusGst: "GST கூடுதலாக செலுத்த வேண்டும்",
    notFound: "இந்த பொருள் கிடைக்கவில்லை.",
    addToCart: "கூடையில் சேர்",
    added: "சேர்க்கப்பட்டது ✓",
    outOfStock: "கையிருப்பில் இல்லை",
  },
  cart: {
    title: "உங்கள் கூடை",
    empty: "உங்கள் கூடை காலியாக உள்ளது.",
    continueShopping: "← தொடர்ந்து பொருட்களைப் பார்",
    quantity: "எண்ணிக்கை",
    remove: "நீக்கு",
    each: "ஒன்றுக்கு",
    subtotal: "கூட்டுத்தொகை",
    tax: "GST",
    shipping: "அனுப்புகை கட்டணம்",
    free: "இலவசம்",
    total: "மொத்தம்",
    proceed: "தொடர்ந்து பணம் செலுத்த",
    fixIssues: "தொடர்வதற்கு முன் மேலே உள்ள பொருட்களை சரிசெய்யவும்.",
    minOrder: "குறைந்தபட்ச ஆர்டர் தொகை பூர்த்தி செய்யப்படவில்லை.",
  },
  checkout: {
    title: "பணம் செலுத்துதல்",
    backToCart: "← கூடைக்குத் திரும்பு",
    contactHeading: "தொடர்பு விவரங்கள்",
    deliveryHeading: "விநியோக முகவரி",
    name: "முழுப் பெயர்",
    phone: "கைபேசி எண்",
    email: "மின்னஞ்சல்",
    emailOptional: "மின்னஞ்சல் (விருப்பம்)",
    addressLine1: "முகவரி வரி 1",
    addressLine2: "முகவரி வரி 2 (விருப்பம்)",
    city: "நகரம் / ஊர்",
    state: "மாநிலம்",
    selectState: "உங்கள் மாநிலத்தைத் தேர்ந்தெடுக்கவும்",
    pincode: "அஞ்சல் குறியீடு",
    summary: "ஆர்டர் சுருக்கம்",
    placeOrder: "ஆர்டர் செய்",
    paymentNote:
      "அடுத்து UPI (GPay / PhonePe / Paytm) மூலம் பணம் செலுத்துவீர்கள். தானாக எந்தத் தொகையும் பிடிக்கப்படாது — உங்கள் பரிவர்த்தனை எண்ணை நீங்கள் பதிவு செய்ய, ஆர்டரை உறுதிப்படுத்தும் முன் நாங்கள் சரிபார்ப்போம்.",
  },
  payment: {
    title: "உங்கள் ஆர்டருக்குப் பணம் செலுத்துங்கள்",
    amountDue: "செலுத்த வேண்டிய தொகை",
    payTo: "யாருக்கு செலுத்த வேண்டும்",
    scanQr: "எந்த UPI செயலியிலும் இந்த QR குறியீட்டை ஸ்கேன் செய்யுங்கள்",
    openUpiApp: "UPI செயலியைத் திற",
    orderRef: "ஆர்டர் குறிப்பு எண்",
    instructionsHeading: "பணம் செலுத்தும் வழிமுறைகள்",
    afterPaying:
      "பணம் செலுத்திய பிறகு, நாங்கள் சரிபார்க்க உங்கள் UPI பரிவர்த்தனை எண் / UTR-ஐ கீழே பதிவு செய்யுங்கள்.",
    utrLabel: "UPI பரிவர்த்தனை எண் / UTR",
    utrHelp:
      "பணம் வெற்றிகரமாகச் சென்ற பிறகு உங்கள் UPI செயலியில் காட்டப்படும் 12 இலக்க குறிப்பு எண்.",
    payerNameOptional: "பணம் செலுத்தும் கணக்கின் பெயர் (விருப்பம்)",
    payerVpaOptional: "உங்கள் UPI ஐடி (விருப்பம்)",
    submit: "நான் பணம் செலுத்திவிட்டேன் — சரிபார்ப்புக்கு அனுப்பு",
    submitting: "அனுப்புகிறது…",
    verifyingTitle: "பணம் பெறப்பட்டது — சரிபார்க்கப்படுகிறது",
    verifyingBody:
      "உங்கள் பரிவர்த்தனை எண் எங்களிடம் உள்ளது; பணத்தைச் சரிபார்க்கிறோம். சரிபார்ப்பு முடிந்ததும் உங்கள் ஆர்டர் உறுதிப்படுத்தப்படும். தேவைப்பட்டால் உங்கள் கைபேசி எண்ணில் தொடர்பு கொள்வோம்.",
    paidTitle: "பணம் உறுதிப்படுத்தப்பட்டது",
    paidBody: "உங்கள் பணம் சரிபார்க்கப்பட்டது. நன்றி!",
    failedTitle: "பணம் உறுதிப்படுத்தப்படவில்லை",
    failedBody:
      "இந்த ஆர்டரின் பணம் உறுதிப்படுத்த முடியவில்லை; கையிருப்பு ஒதுக்கீடு விடுவிக்கப்பட்டது. புதிய ஆர்டர் செய்யுங்கள் அல்லது எங்களைத் தொடர்பு கொள்ளுங்கள்.",
    noAccount:
      "இந்த ஆர்டருக்கு ஆன்லைன் பணம் செலுத்தும் விவரங்கள் கிடைக்கவில்லை. பணம் செலுத்த ஏற்பாடு செய்ய உங்கள் கைபேசி எண்ணில் தொடர்பு கொள்வோம்.",
    viewOrder: "ஆர்டர் விவரங்களைப் பார்",
    error: "உங்கள் பணத்தைப் பதிவு செய்ய முடியவில்லை. மீண்டும் முயற்சிக்கவும்.",
  },
  confirmation: {
    title: "ஆர்டர் பெறப்பட்டது",
    thanks: "நன்றி! உங்கள் ஆர்டர் பெறப்பட்டது.",
    reference: "ஆர்டர் குறிப்பு எண்",
    status: "நிலை",
    paymentPending: "பணம் செலுத்த வேண்டியுள்ளது",
    paymentVerifying: "பணம் சரிபார்க்கப்படுகிறது",
    paymentPaid: "பணம் உறுதிப்படுத்தப்பட்டது",
    paymentFailed: "பணம் உறுதிப்படுத்தப்படவில்லை",
    contactNote:
      "அனுப்புகையை உறுதிப்படுத்த உங்கள் கைபேசி எண்ணில் தொடர்பு கொள்வோம்.",
    deliverTo: "விநியோகம்",
    items: "பொருட்கள்",
    notFound: "அந்த ஆர்டரைக் கண்டுபிடிக்க முடியவில்லை.",
  },
  tracking: {
    title: "உங்கள் ஆர்டரைக் கண்காணியுங்கள்",
    refLabel: "ஆர்டர்",
    statusPaid: "பணம் உறுதிப்படுத்தப்பட்டது",
    statusPacked: "பேக் செய்யப்பட்டது",
    statusParcelBooked: "கூரியரிடம் ஒப்படைக்கப்பட்டது",
    statusCompleted: "வழங்கப்பட்டது",
    statusCancelled: "ரத்து செய்யப்பட்டது",
    bannerPreparing: "உங்கள் ஆர்டர் அனுப்புவதற்குத் தயாராகிறது.",
    bannerDispatched: "உங்கள் பார்சல் வழியில் உள்ளது.",
    bannerCompleted: "உங்கள் ஆர்டர் வழங்கப்பட்டது.",
    bannerCancelled: "இந்த ஆர்டர் ரத்து செய்யப்பட்டது.",
    stagePayment: "பணம் பெறப்பட்டது",
    stagePacked: "ஆர்டர் பேக் செய்யப்பட்டது",
    stageParcelBooked: "பார்சல் புக் செய்யப்பட்டது",
    stageLrAvailable: "LR நகல் கிடைக்கிறது",
    stageReview: "மதிப்பாய்வு",
    stateCurrent: "நடைபெறுகிறது",
    statePending: "நிலுவையில்",
    courier: "கூரியர் / போக்குவரத்து",
    lrNumber: "LR / பார்சல் எண்",
    bookingDate: "புக்கிங் தேதி",
    parcelCount: "பார்சல்களின் எண்ணிக்கை",
    destination: "சேருமிடம்",
    items: "பொருட்கள்",
    downloadLr: "LR நகலைப் பதிவிறக்குங்கள்",
    lrPending:
      "உங்கள் பார்சல் கூரியருடன் புக் செய்யப்பட்டதும் LR நகல் இங்கே தோன்றும்.",
    reviewPending:
      "உங்கள் ஆர்டர் வழங்கப்பட்ட பிறகு நீங்கள் மதிப்பாய்வு அளிக்கலாம்.",
    cancelledNote:
      "இந்த ரத்து குறித்து ஏதேனும் கேள்விகள் இருந்தால், எங்களைத் தொடர்பு கொள்ளுங்கள்.",
    invalidTitle: "இந்த கண்காணிப்பு இணைப்பு செல்லுபடியாகாது",
    invalidBody:
      "இணைப்பு தவறாக இருக்கலாம், காலாவதியாகியிருக்கலாம் அல்லது செயலில் இல்லாமல் இருக்கலாம். உங்களுக்கு வழங்கப்பட்ட இணைப்பைச் சரிபார்க்கவும் அல்லது உதவிக்கு எங்களைத் தொடர்பு கொள்ளவும்.",
    contactNote:
      "உங்கள் ஆர்டர் தொடர்பான உதவிக்கு, எங்கள் இணையதளத்தில் உள்ள எண்ணில் தொடர்பு கொள்ளுங்கள்.",
    shareTitle: "பகிரக்கூடிய கண்காணிப்பு இணைப்பு",
    shareHint:
      "பகிர்வதற்குப் பாதுகாப்பானது — இது டெலிவரி முன்னேற்றத்தை மட்டுமே காட்டுகிறது, உங்கள் முகவரி அல்லது தொடர்பு விவரங்களை அல்ல.",
    shareReveal: "கண்காணிப்பு இணைப்பைக் காட்டு",
    shareRefresh: "புதிய இணைப்பைப் பெறு",
    shareCopy: "நகலெடு",
    shareCopied: "நகலெடுக்கப்பட்டது",
  },
  notifications: {
    paymentReceived:
      "Q Crackers: வணக்கம் {name}, ஆர்டர் {orderNo}-க்கான உங்கள் பணம் {amount} பெறப்பட்டது. உங்கள் ஆர்டர் உறுதிப்படுத்தப்பட்டது, விரைவில் பேக் செய்யப்படும். இங்கே கண்காணியுங்கள்: {link}",
    orderPacked:
      "Q Crackers: வணக்கம் {name}, ஆர்டர் {orderNo} பேக் செய்யப்பட்டு அனுப்பத் தயாராக உள்ளது. இங்கே கண்காணியுங்கள்: {link}",
    parcelBooked:
      "Q Crackers: வணக்கம் {name}, ஆர்டர் {orderNo} {courier} நிறுவனத்திடம் ஒப்படைக்கப்பட்டது (LR எண் {lrNumber}, {parcels} பார்சல்). இங்கே கண்காணியுங்கள்: {link}",
    lrAvailable:
      "Q Crackers: வணக்கம் {name}, ஆர்டர் {orderNo}-க்கான LR நகல் (LR எண் {lrNumber}) இப்போது கிடைக்கிறது. உங்கள் கண்காணிப்புப் பக்கத்திலிருந்து பதிவிறக்கலாம்: {link}",
    reviewRequest:
      "Q Crackers: வணக்கம் {name}, உங்கள் ஆர்டர் {orderNo} உங்களுக்குப் பிடித்திருக்கும் என நம்புகிறோம். சிறிது நேரம் இருந்தால், உங்கள் கருத்தைப் பகிருங்கள்: {link}",
  },
  footer: {
    contact: "தொடர்பு",
    rights: "அனைத்து உரிமைகளும் பாதுகாக்கப்பட்டவை.",
  },
  language: "மொழி",
};

const DICTIONARIES: Record<Locale, Dictionary> = { en, ta };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? en;
}
