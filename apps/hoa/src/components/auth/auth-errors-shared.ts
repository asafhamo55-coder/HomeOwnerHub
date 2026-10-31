// Pure module: turns what Supabase auth says into plain words and a next step.
// Raw provider text is never returned. Safe to import from client components.

export const SUPPORT_EMAIL = 'support@homeownerledger.com'
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`

export type AuthErrorKind =
  | 'invalid-credentials'
  | 'already-registered'
  | 'rate-limit'
  | 'email-not-confirmed'
  | 'weak-password'
  | 'network'
  | 'other'

export interface AuthErrorLike {
  message?: string
  code?: string
  status?: number
}

export function classifyAuthError(err: AuthErrorLike | null | undefined): AuthErrorKind {
  const code = (err?.code ?? '').toLowerCase()
  const msg = (err?.message ?? '').toLowerCase()
  if (code === 'invalid_credentials' || /invalid login credentials|invalid credentials/.test(msg)) {
    return 'invalid-credentials'
  }
  if (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    /already registered|already been registered|already exists/.test(msg)
  ) {
    return 'already-registered'
  }
  if (
    err?.status === 429 ||
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit' ||
    code === 'over_sms_send_rate_limit' ||
    /rate limit|too many|for security purposes/.test(msg)
  ) {
    return 'rate-limit'
  }
  if (code === 'email_not_confirmed' || /not confirmed|confirm your email/.test(msg)) {
    return 'email-not-confirmed'
  }
  if (code === 'weak_password' || code === 'same_password' || /password should|weak password|different from the old/.test(msg)) {
    return 'weak-password'
  }
  if (/failed to fetch|networkerror|network request failed|load failed/.test(msg)) return 'network'
  return 'other'
}

const MESSAGES: Record<AuthErrorKind, string> = {
  'invalid-credentials':
    'That email or password doesn’t match. Try “Email me a link” instead, or reset your password.',
  'already-registered':
    'There is already an account for that email. Go to Sign in and choose “Email me a link”, or reset your password.',
  'rate-limit': 'That was too many tries in a short time. Please wait a few minutes, then try again.',
  'email-not-confirmed':
    'Your email is not confirmed yet. Open the email we sent you and tap its link. Can’t find it? Check your spam folder, or choose “Email me a link” to get a new one.',
  'weak-password':
    'That password is too easy to guess. Try a longer one, such as three or four words in a row.',
  network: 'We couldn’t reach the server. Check your internet connection, then try again.',
  other: `Something went wrong on our end. Please try again in a minute. If it keeps happening, email ${SUPPORT_EMAIL}.`,
}

/** Plain-words message plus what to do next. Never contains the raw provider text. */
export function friendlyAuthError(err: AuthErrorLike | null | undefined): string {
  return MESSAGES[classifyAuthError(err)]
}
