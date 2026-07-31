import { NextResponse } from 'next/server'
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
    await inngest.send({
      name: 'mailbox/backfill.requested',
      data: { accountId },
    })

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
