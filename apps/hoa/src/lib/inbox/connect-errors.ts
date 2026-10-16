// The `?error=` value the mailbox OAuth routes redirect back with, and the
// text the landing pages (settings/mailbox, onboarding/setup) show for it.
//
// RC-1 / RC-2 (.claude/skills/api-route-conventions): a redirect route puts a
// CODE in the URL, never a message — a thrown message can name env vars,
// tables or provider internals, and anything in a URL lands in access logs
// and browser history. The page turns the code into words here.

export const MAILBOX_CONNECT_ERROR_MESSAGES = {
  forbidden: 'Only an HOA admin can connect a mailbox for this organization.',
  not_configured: 'Mailbox connection is not set up yet. Contact support to finish setup.',
  internal: 'We could not start the connection to Google. Try again in a moment.',
} as const

export type MailboxConnectErrorCode = keyof typeof MAILBOX_CONNECT_ERROR_MESSAGES

/** Build `${returnTo}?error=<code>` (keeping any query already on returnTo). */
export function connectErrorRedirect(returnTo: string, code: MailboxConnectErrorCode, base: string): URL {
  const url = new URL(returnTo, base)
  url.searchParams.set('error', code)
  return url
}

/**
 * The text to show for an `?error=` value. A known code maps to its
 * message. Anything else is passed through unchanged: /api/oauth/google/
 * callback still forwards Google's own codes (`access_denied`) and its own
 * messages until it is brought into line — tighten this to a generic
 * fallback once it only sends codes.
 */
export function mailboxConnectErrorMessage(value: string): string {
  return Object.prototype.hasOwnProperty.call(MAILBOX_CONNECT_ERROR_MESSAGES, value)
    ? MAILBOX_CONNECT_ERROR_MESSAGES[value as MailboxConnectErrorCode]
    : value
}
