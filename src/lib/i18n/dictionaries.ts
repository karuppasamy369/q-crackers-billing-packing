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
  confirmation: {
    title: string;
    thanks: string;
    reference: string;
    status: string;
    paymentPending: string;
    contactNote: string;
    deliverTo: string;
    items: string;
    notFound: string;
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
      "Online payment is being finalised. Place your order now — we will contact you to complete payment.",
  },
  confirmation: {
    title: "Order received",
    thanks: "Thank you! Your order has been received.",
    reference: "Order reference",
    status: "Status",
    paymentPending: "Awaiting payment",
    contactNote:
      "We will contact you on your mobile number to complete payment and confirm dispatch.",
    deliverTo: "Deliver to",
    items: "Items",
    notFound: "We could not find that order.",
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
      "ஆன்லைன் பணம் செலுத்துதல் இறுதி செய்யப்படுகிறது. இப்போது ஆர்டர் செய்யுங்கள் — பணம் செலுத்துவதை முடிக்க நாங்கள் உங்களைத் தொடர்பு கொள்வோம்.",
  },
  confirmation: {
    title: "ஆர்டர் பெறப்பட்டது",
    thanks: "நன்றி! உங்கள் ஆர்டர் பெறப்பட்டது.",
    reference: "ஆர்டர் குறிப்பு எண்",
    status: "நிலை",
    paymentPending: "பணம் செலுத்த வேண்டியுள்ளது",
    contactNote:
      "பணம் செலுத்துவதை முடிக்கவும் அனுப்புகையை உறுதிப்படுத்தவும் உங்கள் கைபேசி எண்ணில் தொடர்பு கொள்வோம்.",
    deliverTo: "விநியோகம்",
    items: "பொருட்கள்",
    notFound: "அந்த ஆர்டரைக் கண்டுபிடிக்க முடியவில்லை.",
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
