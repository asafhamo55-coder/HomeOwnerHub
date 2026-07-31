import { NextResponse } from 'next/server'
import { inngest } from '@homeowner-portal/jobs'
import { completeConnect } from '@/lib/inbox/connect'

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

    return NextResponse.redirect(
      new URL(`${returnTo}?connected=1&account=${accountId}`, request.url),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed.'
    return NextResponse.redirect(
      new URL(`/settings/mailbox?error=${encodeURIComponent(message)}`, request.url),
    )
  }
}
