import { NextResponse } from 'next/server'

// Deliberately throws, so whoever sets up Sentry can prove an event goes
// all the way through: request error → onRequestError
// (src/instrumentation.ts) → beforeSend scrubber → Sentry.
//
// Lives under api/cron only because src/middleware.ts excludes that prefix
// from the session-auth redirect (these routes carry their own auth); it
// is not scheduled in vercel.json.
//
// Fails CLOSED like api/cron/recurring-events: no CRON_SECRET configured
// means 503, never an open endpoint. Bearer header only — no `?key=`
// variant, so the secret never lands in a URL or access log.
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<hoa-host>/api/cron/sentry-test

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'cron_secret_not_configured' }, { status: 503 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  throw new Error(`Sentry test error from hoa (${process.env.VERCEL_GIT_COMMIT_SHA ?? 'local'})`)
}
