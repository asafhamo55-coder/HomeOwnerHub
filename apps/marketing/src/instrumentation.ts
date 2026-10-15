import * as Sentry from '@sentry/nextjs'
import { sentryInitOptions } from '@homeowner-portal/observability'

// Server + edge error reporting. Inert unless SENTRY_DSN (or
// NEXT_PUBLIC_SENTRY_DSN) is set — see packages/observability.
export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') Sentry.init(sentryInitOptions('marketing', 'server'))
  if (process.env.NEXT_RUNTIME === 'edge') Sentry.init(sentryInitOptions('marketing', 'edge'))
}

// Errors thrown from server components, route handlers and server actions.
export const onRequestError = Sentry.captureRequestError
