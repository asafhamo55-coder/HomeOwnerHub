import * as Sentry from '@sentry/nextjs'
import { sentryInitOptions } from '@homeowner-portal/observability'

// Browser error reporting. Inert unless NEXT_PUBLIC_SENTRY_DSN is set.
// No session replay: it would record residents' screens.
Sentry.init(sentryInitOptions('pm', 'client'))

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
