/**
 * Google OAuth 2.0 for Gmail, over plain fetch.
 *
 * Scope choice matters for Google's verification review: gmail.readonly +
 * gmail.send are both RESTRICTED scopes requiring a security assessment,
 * but they are far narrower than https://mail.google.com/ (full mailbox
 * control including delete). Requesting the minimum is both correct and
 * materially easier to get approved.
 *
 * gmail.send is requested in Phase A even though sending ships in Phase B,
 * because widening scopes later forces every connected HOA back through
 * the consent screen.
 */

import { MailboxAuthError, type OAuthTokens } from './types'

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.settings.basic', // users.settings.sendAs
  'openid',
  'email',
] as const

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set.`)
  return value
}

export function buildConsentUrl(opts: { state: string; loginHint?: string }): string {
  const params = new URLSearchParams({
    client_id: requireEnv('GOOGLE_OAUTH_CLIENT_ID'),
    redirect_uri: requireEnv('GOOGLE_OAUTH_REDIRECT_URI'),
    response_type: 'code',
    scope: GMAIL_SCOPES.join(' '),
    state: opts.state,
    // offline + consent guarantee a refresh_token. Without prompt=consent
    // Google omits it on re-authorization, and the mailbox silently stops
    // syncing about an hour later when the access token expires.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  })
  if (opts.loginHint) params.set('login_hint', opts.loginHint)

  return `${AUTH_ENDPOINT}?${params.toString()}`
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: string
  error_description?: string
}

// Google error codes on the token endpoint that mean the grant itself is
// dead — retrying will never succeed and the HOA must re-authorize. Only
// these warrant MailboxAuthError.
//
// Deliberately excluded: invalid_request. RFC 6749 §5.2 defines it as
// "the request is missing a required parameter, includes an invalid
// parameter value, includes a parameter more than once, or is otherwise
// malformed." That is a bug in OUR request construction, not a dead grant.
// If it fires, it fires deterministically on every attempt (same code sends
// same request). Classifying it as MailboxAuthError tells the HOA to
// reconnect Gmail — which rebuilds the identical malformed request and
// reproduces the identical error. That creates an unresolvable support loop.
const CREDENTIAL_REJECTION_ERRORS = new Set([
  'invalid_grant',
  'invalid_client',
  'unauthorized_client',
])

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  let json: TokenResponse
  try {
    json = (await response.json()) as TokenResponse
  } catch {
    // An HTML error page or gateway-timeout body from oauth2.googleapis.com
    // is plausible under load. That's not proof the credential is dead —
    // it's a transient/unexpected failure, so it must not become
    // MailboxAuthError (which stops the sync job's retries permanently).
    throw new Error(`Token endpoint returned a non-JSON response (status ${response.status}).`)
  }

  // Treat presence of json.error as a failure regardless of HTTP status.
  // This catches 200 responses that carry both error and access_token,
  // which must be treated as failures, not successes.
  if (json.error) {
    // Classify based on the error code itself, not the HTTP status.
    // A 400/401 with a credential rejection code means the grant is dead.
    // But we also check the code against CREDENTIAL_REJECTION_ERRORS
    // regardless of status, because Google can return errors in unusual ways.
    if (CREDENTIAL_REJECTION_ERRORS.has(json.error)) {
      throw new MailboxAuthError(json.error_description ?? json.error)
    }
    // For all other error codes (including transient errors, rate limiting,
    // unexpected 200s, etc), it's not proof of a dead credential.
    // Include Google's error text since we already parsed it.
    const detail = json.error_description ?? json.error
    throw new Error(`Token request failed (${response.status}): ${detail}.`)
  }

  if (!response.ok) {
    // No json.error, but non-2xx status — transient or unexpected.
    // This handles cases like 400/401/403/5xx with no error field.
    throw new Error(`Token request failed (${response.status}).`)
  }

  if (!json.access_token) {
    // 200 status, no error field, but missing access_token — unexpected
    // API response, not proof of a revoked grant.
    throw new Error(`Token response missing access_token (status ${response.status}).`)
  }

  return json
}

function toTokens(json: TokenResponse, fallbackRefresh: string | null): OAuthTokens {
  const expiresInSec = json.expires_in ?? 3600
  return {
    accessToken: json.access_token as string,
    refreshToken: json.refresh_token ?? fallbackRefresh,
    expiresAt: new Date(Date.now() + expiresInSec * 1000).toISOString(),
    scope: json.scope ?? '',
  }
}

export async function exchangeCode(code: string): Promise<OAuthTokens> {
  const json = await postToken(
    new URLSearchParams({
      code,
      client_id: requireEnv('GOOGLE_OAUTH_CLIENT_ID'),
      client_secret: requireEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
      redirect_uri: requireEnv('GOOGLE_OAUTH_REDIRECT_URI'),
      grant_type: 'authorization_code',
    }),
  )
  return toTokens(json, null)
}

export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
  const json = await postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requireEnv('GOOGLE_OAUTH_CLIENT_ID'),
      client_secret: requireEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
      grant_type: 'refresh_token',
    }),
  )
  // Google omits refresh_token on refresh — carry the original forward or
  // we lose the only long-lived credential we have.
  return toTokens(json, refreshToken)
}
