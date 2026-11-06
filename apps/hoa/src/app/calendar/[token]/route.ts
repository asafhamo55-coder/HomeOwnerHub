import { createAdminClient } from '@homeowner-portal/db'
import { withRoute } from '@/lib/api/handler'
import { logRouteFailure } from '@/lib/api/log'
import { appOrigin } from '@/lib/app-origin'
import { buildFeedIcs } from '@/lib/calendar-feed/build'
import { loadFeedData } from '@/lib/calendar-feed/load'
import { calendarFeedSecret, verifyFeedToken } from '@/lib/calendar-feed/token'

/**
 * GET /calendar/<token>[.ics]: a read-only, subscribable calendar of one
 * resident's association meetings and community events (Round 29).
 *
 * WHY A TOKEN IN THE URL. Calendar apps fetch with no cookies and no way to
 * sign in. The token is an HMAC over user, org and a link version
 * (lib/calendar-feed/token.ts) made with CALENDAR_FEED_SECRET alone. This
 * route checks the signature first (cheap, no database), then loads with the
 * service role, but only after confirming in the database that the user still
 * exists on the SAME link version and still belongs to the token's org
 * (lib/calendar-feed/load.ts). "Reset my calendar link" bumps the version, so
 * every older link stops working at once.
 *
 * ANSWERS. Every failure (no secret set, bad or tampered token, old version,
 * left the org) is the same plain 404, so the route says nothing about which
 * part failed. A database failure is a 503 so a calendar app retries later
 * instead of treating the feed as empty and deleting events.
 *
 * WHAT IS IN THE FILE. Titles and dates only (lib/calendar-feed/build.ts).
 * No person, no attendee list, no agenda or minutes text.
 *
 * NO RATE LIMIT HELPER. The only shared limiter (lib/api/rate-limit.ts) is an
 * AI-usage ledger that writes an audit_log row per call; a calendar polls
 * hourly per phone, so a ledger row per poll is the wrong cost. The signature
 * check rejects guessed tokens before any database read, and the response is
 * cacheable for 15 minutes.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NOT_FOUND = () =>
  new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  })

export const GET = withRoute('calendar.feed', async (_request: Request, ctx: { params: Promise<{ token: string }> }) => {
  const { token: raw } = await ctx.params
  const claims = verifyFeedToken(calendarFeedSecret(), raw.replace(/\.ics$/i, ''))
  if (!claims) return NOT_FOUND()

  const loaded = await loadFeedData(createAdminClient() as never, claims)
  if (!loaded.ok) {
    if (loaded.reason === 'denied') return NOT_FOUND()
    logRouteFailure('calendar.feed.load', new Error('feed load failed'), { orgId: claims.orgId })
    return new Response('Try again later', { status: 503, headers: { 'retry-after': '900', 'cache-control': 'no-store' } })
  }

  const body = buildFeedIcs({ ...loaded.data, origin: appOrigin() })
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="community-calendar.ics"',
      'cache-control': 'private, max-age=900',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  })
})
