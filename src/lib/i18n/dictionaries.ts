import type { Locale } from "@/lib/settings/registry";

/**
 * Storefront copy. English and Tamil are both first-class. Keep keys flat and
 * stable; translators only touch the values.
 */
export type Dictionary = {
  localeName: string;
  siteName: string;
  tagline: string;
  nav: {
    allProducts: string;
    categories: string;
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
  nav: { allProducts: "All products", categories: "Categories" },
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
  nav: { allProducts: "அனைத்து பொருட்கள்", categories: "வகைகள்" },
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
