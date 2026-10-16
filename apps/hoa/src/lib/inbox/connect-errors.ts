// Mailbox-connect failure codes (RC-1 / RC-2 for the OAuth redirect routes).
//
// The OAuth start and callback routes are browser navigations, so they
// answer with a redirect, not the JSON envelope. The redirect carries
// `?error=<code>` from the fixed list below and never a message: a thrown
// message can carry database text or, for `different_mailbox_connected`,
// both mailbox addresses, and a query string lands in access logs, browser
// history and Referer headers. /settings/mailbox turns the code back into
// text with `connectErrorMessage`.
//
// No node: imports — the settings page renders this.

export const CONNECT_ERROR_MESSAGES = {
  access_denied: 'Google consent was cancelled, so no mailbox was connected.',
  google_error: 'Google could not complete the sign-in. Start the connection again.',
  missing_code: 'Google did not send back an authorization code. Start the connection again.',
  invalid_request: 'That connection link is not valid. Start the connection again from this page.',
  invalid_state: 'That connection link is not valid. Start the connection again from this page.',
  state_expired: 'The connection took too long to finish. Start the connection again.',
  forbidden: 'You do not have permission to connect a mailbox for this organization.',
  no_refresh_token:
    'Google did not return a refresh token. Remove HomeownerHub at ' +
    'myaccount.google.com/permissions and connect again.',
  different_mailbox_connected:
    'This organization already has a different mailbox connected. Disconnect it first, or ' +
    "start again and choose that mailbox on Google's account picker.",
  not_configured: 'Mailbox connection is not set up yet.',
  internal: 'Something went wrong connecting the mailbox. Try again in a moment.',
} as const

export type ConnectErrorCode = keyof typeof CONNECT_ERROR_MESSAGES

export function isConnectErrorCode(value: unknown): value is ConnectErrorCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CONNECT_ERROR_MESSAGES, value)
}

/**
 * The text to show for a `?error=` value. Anything that is not one of our
 * codes gets the generic message — the query string is attacker-writable,
 * so it is never rendered verbatim.
 */
export function connectErrorMessage(value: string | null | undefined): string {
  return isConnectErrorCode(value) ? CONNECT_ERROR_MESSAGES[value] : CONNECT_ERROR_MESSAGES.internal
}

/**
 * A connect failure the person can act on. `code` is what the redirect
 * carries; `message` stays server-side (tests, Sentry) and may name
 * addresses, so it is never put in a URL or a log line.
 */
export class ConnectError extends Error {
  constructor(
    readonly code: ConnectErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ConnectError'
  }
}

/** Build `${returnTo}?error=<code>` (keeping any query already on returnTo). */
export function connectErrorRedirect(returnTo: string, code: ConnectErrorCode, base: string): URL {
  const url = new URL(returnTo, base)
  url.searchParams.set('error', code)
  return url
}
