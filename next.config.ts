import type { NextConfig } from "next";

/**
 * Security headers applied to every response.
 * These are deliberately strict. If a later phase needs to load third-party
 * scripts (e.g. Razorpay checkout, WhatsApp widgets) the CSP must be widened
 * explicitly and reviewed — never loosened casually.
 */
const isDev = process.env.NODE_ENV !== "production";

const cspDirectives = [
  "default-src 'self'",
  // Next.js needs inline/eval for its dev runtime; production is locked down.
  isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspDirectives },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Fail the production build on type or lint errors — never ship broken code.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
  experimental: {
    // Product image uploads go through Server Actions; allow up to ~6 MB
    // (the app caps images at STORAGE_MAX_IMAGE_BYTES, default 5 MB).
    serverActions: { bodySizeLimit: "6mb" },
  },
  // @react-pdf/renderer (bill PDFs) must not be bundled — it loads fonts and
  // uses Node internals at runtime.
  serverExternalPackages: ["@react-pdf/renderer"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Public customer tracking pages: never cache (booking / LR status must
        // be fresh), never index, and never leak the token via the Referer
        // header when the visitor follows an outbound link.
        source: "/track/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
