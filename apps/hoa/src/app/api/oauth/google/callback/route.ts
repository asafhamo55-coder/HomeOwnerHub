import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@homeowner-portal/db'
import { inngest } from '@homeowner-portal/jobs'
import { withRoute } from '@/lib/api/handler'
import { errorCode, logRouteFailure } from '@/lib/api/log'
import {
  completeConnect,
  DEFAULT_RETURN_TO,
  OAUTH_NONCE_COOKIE,
  sanitizeReturnTo,
} from '@/lib/inbox/connect'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ConnectError, type ConnectErrorCode } from '@/lib/inbox/connect-errors'
import { type ConnectBackfillPlan, planConnectBackfill } from '@/lib/inbox/reconnect-backfill'

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
 * Auth (RC-3/RC-4): middleware does not gate /api/oauth/, so this route
 * checks the session itself. The signed `state` alone is a bearer token and
 * is NOT enough: completeConnect also requires the signed-in user to be the
 * user /start minted it for, and the nonce in the state to equal the
 * httpOnly cookie /start set in that browser. The cookie is cleared on
 * every response here, so a state can be used once. completeConnect then
 * re-checks the admin role before any service-role write.
 */
export const GET = withRoute(ROUTE, async (request: Request) => {
  const nonce = readCookie(request, OAUTH_NONCE_COOKIE)
  const response = await handle(request, nonce)
  // Single use: whatever the outcome, this nonce is spent.
  if (nonce !== null) {
    response.headers.append(
      'set-cookie',
      `${OAUTH_NONCE_COOKIE}=; Path=/api/oauth/google; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    )
  }
  return response
})

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim())
  }
  return null
}

async function handle(request: Request, nonce: string | null): Promise<Response> {
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
    const supabase = await getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    ;({ accountId, returnTo } = await completeConnect(code, state, {
      sessionUserId: user?.id ?? null,
      nonce,
    }))
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
  //
  // BL-018: a RECONNECT of a mailbox whose import already completed does
  // not redo the 12-month walk — see lib/inbox/reconnect-backfill.ts. It is
  // skipped (the 5-minute sync resumes from the history id) or narrowed to
  // the gap since the last sync. Pending, failed and wedged imports still
  // get the full backfill, so reconnecting remains their recovery path.
  const plan = await planBackfillFor(accountId)
  try {
    if (plan.kind === 'full') {
      await inngest.send({ name: 'mailbox/backfill.requested', data: { accountId } })
    } else if (plan.kind === 'bounded') {
      await inngest.send({
        name: 'mailbox/backfill.requested',
        data: { accountId, afterDate: plan.afterDate },
      })
    }
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
}

/**
 * Reads the account's backfill/sync state and plans the backfill. A failed
 * read falls back to the full backfill — the pre-BL-018 behaviour, safe
 * because ingest is idempotent — and logs the code only (RC-2).
 */
async function planBackfillFor(accountId: string): Promise<ConnectBackfillPlan> {
  try {
    const { data, error } = await createAdminClient()
      .from('mailbox_accounts')
      .select('backfill_status, backfill_progress, scope_mode, scope_value, last_synced_at, sync_cursor')
      .eq('id', accountId)
      .maybeSingle()
    if (error || !data) {
      if (error) logRouteFailure(ROUTE, error, { stage: 'read_backfill_state', accountId })
      return { kind: 'full', reason: 'unknown' }
    }
    return planConnectBackfill(data, new Date())
  } catch (error) {
    logRouteFailure(ROUTE, error, { stage: 'read_backfill_state', accountId })
    return { kind: 'full', reason: 'unknown' }
  }
}

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
