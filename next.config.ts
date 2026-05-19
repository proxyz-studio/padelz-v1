import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Next 16 has stable instrumentation.ts pickup — no `experimental.instrumentationHook` flag needed.

// PROXYZ Studio security headers — follows SMB Web-Service/05-Security playbook.
// CSP starts in Report-Only mode so we can observe violations from Clerk / Sentry /
// Vercel Analytics scripts without breaking the site. Promote to enforced
// `Content-Security-Policy` once Sentry's report URI is wired and we've watched
// the report stream for a week.
const cspDirectives = [
  "default-src 'self'",
  // Clerk + Vercel + Sentry need their CDNs. 'unsafe-inline' for now because
  // Next.js can emit inline bootstrap scripts; tighten later with a per-request nonce.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com https://va.vercel-scripts.com https://vitals.vercel-insights.com https://browser.sentry-cdn.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://api.clerk.com https://*.ingest.sentry.io https://sentry.io https://va.vercel-scripts.com https://vitals.vercel-insights.com https://*.upstash.io wss://*.clerk.accounts.dev wss://*.vercel.live",
  "frame-src 'self' https://*.clerk.accounts.dev https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.clerk.accounts.dev",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join('; ');

const securityHeaders = [
  // HSTS — Vercel sets this by default at 2yr, repeating explicitly for clarity.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // CSP in Report-Only — observe-only until promoted.
  { key: 'Content-Security-Policy-Report-Only', value: cspDirectives },
  // Clickjacking
  { key: 'X-Frame-Options', value: 'DENY' },
  // MIME sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Referrer leakage
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Lock down browser APIs we don't use
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=(), payment=(self)',
  },
];

const nextConfig: NextConfig = {
  images: { domains: ['public.blob.vercel-storage.com', 'img.clerk.com'] },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: 'proxyz-studio',
  project: 'padelz',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: { disable: true },
});
