import { NextResponse } from 'next/server'
import { createAdminClient } from '@homeowner-portal/db'
import { inngest } from '@homeowner-portal/jobs'
import { completeConnect, sanitizeReturnTo } from '@/lib/inbox/connect'

/**
 * Google redirects here after consent.
 *
 * Errors redirect back to the originating page with a readable message
 * rather than rendering a raw 500 — a failed mailbox connection is a
 * recoverable user situation, not a crash. Redirects never carry a
 * token, authorization code, or client secret — only `denied` (one of
 * Google's own fixed error codes, e.g. "access_denied") or a message we
 * threw ourselves.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams

  const denied = params.get('error')
  if (denied) {
    return NextResponse.redirect(
      new URL(`/settings/mailbox?error=${encodeURIComponent(denied)}`, request.url),
    )
  }

  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/settings/mailbox?error=missing_code', request.url),
    )
  }

  try {
    const { accountId, returnTo } = await completeConnect(code, state)

    // Kick off the 12-month import so the connect preview has real
    // numbers by the time the user looks at it.
    //
    // Deliberately NOT inside the try that wraps completeConnect. By the
    // time we get here the account row and its encrypted credentials are
    // already committed — the mailbox IS connected. Letting a failure here
    // fall into the catch below reported "Could not connect" for a
    // connection that had in fact succeeded, which invites the user to
    // retry something that already worked. (Found in live testing: a
    // missing Inngest event key in a local dev environment.)
    //
    // The failure still has to be visible, and 'pending' would not be:
    // mailboxWatchdogJob only rescues backfills stuck in 'running', so a
    // backfill that never STARTED is invisible to it forever. Mark it
    // 'failed' instead, which is a state the UI already renders as
    // "History import stopped … reconnect now" — and reconnecting does
    // re-emit this event, so the advice is true.
    try {
      await inngest.send({
        name: 'mailbox/backfill.requested',
        data: { accountId },
      })
    } catch (sendError) {
      const reason = sendError instanceof Error ? sendError.message : 'unknown error'
      console.error(
        `oauth/callback: could not queue historical backfill for account ${accountId}: ${reason}`,
      )

      const { error: markError } = await createAdminClient()
        .from('mailbox_accounts')
        .update({ backfill_status: 'failed' })
        .eq('id', accountId)

      if (markError) {
        // Nothing left to escalate to — the mailbox is connected and
        // syncing, only the history import is missing. Log and continue
        // rather than turning a partial success into a hard failure.
        console.error(
          `oauth/callback: could not mark backfill failed for account ${accountId}: ${markError.code} ${markError.message}`,
        )
      }
    }

    // `completeConnect` already sanitizes `returnTo` before returning it,
    // but this route interpolates it straight into a redirect URL, and a
    // `state` blob may have been minted and signed by an older build
    // that trusted an unvalidated `returnTo`. Re-validating at the point
    // of use costs nothing and removes the dependency on every caller of
    // `completeConnect` remembering to do it upstream.
    return NextResponse.redirect(
      new URL(`${sanitizeReturnTo(returnTo)}?connected=1&account=${accountId}`, request.url),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed.'
    return NextResponse.redirect(
      new URL(`/settings/mailbox?error=${encodeURIComponent(message)}`, request.url),
    )
  }
}
