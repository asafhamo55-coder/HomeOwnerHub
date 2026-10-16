import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@homeowner-portal/db'
import { inngest } from '@homeowner-portal/jobs'
import { withRoute } from '@/lib/api/handler'
import { errorCode, logRouteFailure } from '@/lib/api/log'
import { completeConnect, DEFAULT_RETURN_TO, sanitizeReturnTo } from '@/lib/inbox/connect'
import { ConnectError, type ConnectErrorCode } from '@/lib/inbox/connect-errors'

const ROUTE = 'oauth.google.callback'

/**
 * Upper bounds on Google's query params (RC-8). A real authorization code
 * is a few hundred characters and our signed `state` well under 1 KB; the
 * caps only stop an absurd value from reaching the HMAC and Google's token
 * endpoint.
 */
const MAX_CODE_LENGTH = 2048
const MAX_STATE_LENGTH = 4096

/**
 * Google redirects here after consent.
 *
 * A browser navigation, not a fetch: every outcome is a redirect, which
 * RC-1 allows for the OAuth routes. Failures go back to /settings/mailbox
 * with `?error=<code>` from the fixed list in lib/inbox/connect-errors.ts,
 * never a message (RC-2) — a thrown message can carry database text, and
 * the different-mailbox refusal names both addresses. The page maps the
 * code to readable text. A failed mailbox connection is a recoverable user
 * situation, not a crash, so nothing here answers a raw 500.
 *
 * Auth (RC-3/RC-4): there is no session check here — middleware does not
 * gate /api/oauth/, and the caller is Google's redirect. The signed,
 * short-lived `state` is the credential: completeConnect verifies its HMAC
 * and expiry and then re-checks the user's board/admin role before any
 * service-role write. /start minted that state behind an admin gate.
 */
export const GET = withRoute(ROUTE, async (request: Request) => {
  const params = new URL(request.url).searchParams

  const denied = params.get('error')
  if (denied) {
    // Attacker-writable: never echoed. `access_denied` (the user clicked
    // Cancel) is the only one of Google's codes worth its own message.
    return failureRedirect(request, denied === 'access_denied' ? 'access_denied' : 'google_error')
  }

  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state) return failureRedirect(request, 'missing_code')
  if (code.length > MAX_CODE_LENGTH || state.length > MAX_STATE_LENGTH) {
    return failureRedirect(request, 'invalid_request')
  }

  let accountId: string
  let returnTo: string
  try {
    ;({ accountId, returnTo } = await completeConnect(code, state))
  } catch (error) {
    if (error instanceof ConnectError) {
      // Expected and actionable (expired link, wrong mailbox, …). Code only.
      logRouteFailure(ROUTE, error, { stage: 'complete_connect', reason: error.code })
      return failureRedirect(request, error.code)
    }
    logRouteFailure(ROUTE, error, { stage: 'complete_connect' })
    Sentry.captureException(error, { tags: { where: `api:${ROUTE}`, code: errorCode(error) ?? 'none' } })
    return failureRedirect(request, 'internal')
  }

  // Kick off the 12-month import so the connect preview has real numbers
  // by the time the user looks at it.
  //
  // Deliberately outside the completeConnect try above. By the time we get
  // here the account row and its encrypted credentials are already
  // committed — the mailbox IS connected. Letting a failure here report
  // "Could not connect" for a connection that had in fact succeeded
  // invites the user to retry something that already worked. (Found in
  // live testing: a missing Inngest event key in a local dev environment.)
  //
  // The failure still has to be visible, and 'pending' would not be:
  // mailboxWatchdogJob only rescues backfills stuck in 'running', so a
  // backfill that never STARTED is invisible to it forever. Mark it
  // 'failed' instead, which is a state the UI already renders as "History
  // import stopped … reconnect now" — and reconnecting does re-emit this
  // event, so the advice is true.
  try {
    await inngest.send({ name: 'mailbox/backfill.requested', data: { accountId } })
  } catch (sendError) {
    logRouteFailure(ROUTE, sendError, { stage: 'queue_backfill', accountId })
    await markBackfillFailed(accountId)
  }

  // `completeConnect` already sanitizes `returnTo`, but this route
  // interpolates it straight into a redirect URL, and a `state` blob may
  // have been minted and signed by an older build that trusted an
  // unvalidated `returnTo`. Re-validating at the point of use costs nothing.
  return NextResponse.redirect(
    new URL(`${sanitizeReturnTo(returnTo)}?connected=1&account=${encodeURIComponent(accountId)}`, request.url),
  )
})

/**
 * RC-6: the write's result is checked and its failure logged by code. It
 * is deliberately not escalated — the mailbox is connected and syncing,
 * only the history import is missing, so turning a partial success into a
 * hard failure would be wrong. What is left behind on failure: the account
 * keeps backfill_status 'pending' until the next reconnect re-queues it.
 */
async function markBackfillFailed(accountId: string): Promise<void> {
  try {
    const { error: markError } = await createAdminClient()
      .from('mailbox_accounts')
      .update({ backfill_status: 'failed' })
      .eq('id', accountId)
    if (markError) logRouteFailure(ROUTE, markError, { stage: 'mark_backfill_failed', accountId })
  } catch (error) {
    logRouteFailure(ROUTE, error, { stage: 'mark_backfill_failed', accountId })
  }
}

function failureRedirect(request: Request, code: ConnectErrorCode): Response {
  return NextResponse.redirect(new URL(`${DEFAULT_RETURN_TO}?error=${code}`, request.url))
}
