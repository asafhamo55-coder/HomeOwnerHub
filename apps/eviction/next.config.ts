import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs/config'

// Baseline security headers. The CSP is REPORT-ONLY: it logs violations in
// the browser console and blocks nothing. 'unsafe-inline' stays because Next
// injects inline bootstrap scripts without a nonce pipeline; 'unsafe-eval' is
// allowed only under `next dev`.
const SCRIPT_EVAL = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${SCRIPT_EVAL} https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.sentry.io https://*.ingest.sentry.io https://vitals.vercel-insights.com https://va.vercel-scripts.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ')

const config: NextConfig = {
  transpilePackages: [
    '@homeowner-portal/ui',
    '@homeowner-portal/ai',
    '@homeowner-portal/db',
    '@homeowner-portal/observability',
  ],
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
          { key: 'Content-Security-Policy-Report-Only', value: CSP },
        ],
      },
    ]
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
