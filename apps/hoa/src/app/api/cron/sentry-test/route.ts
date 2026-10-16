import { ApiRouteError } from '@/lib/api/errors'
import { requireBearerSecret } from '@/lib/api/secrets'

// Deliberately throws, so whoever sets up Sentry can prove an event goes
// all the way through: request error → onRequestError
// (src/instrumentation.ts) → beforeSend scrubber → Sentry.
//
// Lives under api/cron only because src/middleware.ts excludes that prefix
// from the session-auth redirect (these routes carry their own auth); it
// is not scheduled in vercel.json.
//
// RC-10 exemption: NOT wrapped in withRoute, because withRoute would turn
// the deliberate throw into a JSON 500 and onRequestError would never see
// it. Only the auth failures below are converted to the RC-1 envelope.
//
// RC-7: its own secret, SENTRY_TEST_SECRET — not CRON_SECRET, which is for
// Vercel cron only (R-21 / C-06). Bearer header only, timing-safe, fails
// CLOSED (503 not_configured when unset, 401 unauthenticated on a wrong or
// missing token). No `?key=` variant, so the secret never lands in a URL
// or access log.
//
//   curl -H "Authorization: Bearer $SENTRY_TEST_SECRET" https://<hoa-host>/api/cron/sentry-test

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  try {
    requireBearerSecret(request, 'SENTRY_TEST_SECRET')
  } catch (err) {
    if (err instanceof ApiRouteError) return err.toResponse()
    throw err
  }

  throw new Error(`Sentry test error from hoa (${process.env.VERCEL_GIT_COMMIT_SHA ?? 'local'})`)
}
