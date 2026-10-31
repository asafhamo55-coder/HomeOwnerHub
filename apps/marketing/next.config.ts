import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs/config'

const config: NextConfig = {
  transpilePackages: ['@homeowner-portal/ui', '@homeowner-portal/observability', '@homeowner-portal/ai'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
      {
        // Public brand files carry no content hash: a day in the browser, a week at the edge.
        source: '/brand/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400' }],
      },
    ]
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
}

// Sentry build integration — see apps/hoa/next.config.ts. Uploads source
// maps only when SENTRY_AUTH_TOKEN is set; otherwise a no-op.
const hasSentryToken = Boolean(process.env.SENTRY_AUTH_TOKEN)

export default withSentryConfig(config, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: { disable: !hasSentryToken },
  release: { create: hasSentryToken, finalize: hasSentryToken },
})
