import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs/config'

const config: NextConfig = {
  transpilePackages: [
    '@homeowner-portal/ui',
    '@homeowner-portal/ai',
    '@homeowner-portal/db',
    '@homeowner-portal/observability',
  ],
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
