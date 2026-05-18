import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: { domains: ['public.blob.vercel-storage.com', 'img.clerk.com'] },
};

export default withSentryConfig(nextConfig, {
  org: 'proxyz-studio',
  project: 'padelz',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: { disable: true },
});
