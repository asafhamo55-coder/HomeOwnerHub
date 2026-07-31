import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildConsentUrl, exchangeCode, GMAIL_SCOPES, refreshAccessToken } from './oauth'
import { MailboxAuthError } from './types'

beforeEach(() => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id'
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-secret'
  process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://app.test/api/oauth/google/callback'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('buildConsentUrl', () => {
  it('requests offline access with forced consent', () => {
    const url = new URL(buildConsentUrl({ state: 'abc123' }))
    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    )
    expect(url.searchParams.get('client_id')).toBe('test-client-id')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBe('abc123')
    // offline + consent is what guarantees a refresh_token comes back.
    // Without prompt=consent, Google omits it on re-authorization and the
    // mailbox silently stops syncing when the access token expires.
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
  })

  it('requests exactly the scopes we need and no more', () => {
    const url = new URL(buildConsentUrl({ state: 's' }))
    const scope = url.searchParams.get('scope') ?? ''
    const requested = scope.split(' ')
    expect(requested).toContain('https://www.googleapis.com/auth/gmail.readonly')
    expect(requested).toContain('https://www.googleapis.com/auth/gmail.send')
    expect(requested).toContain('https://www.googleapis.com/auth/gmail.settings.basic')
    expect(requested).toContain('openid')
    expect(requested).toContain('email')
    expect(GMAIL_SCOPES).not.toContain('https://mail.google.com/')
    expect(requested).not.toContain('https://mail.google.com/')
  })

  it('passes login_hint when given', () => {
    const url = new URL(buildConsentUrl({ state: 's', loginHint: 'board@mp.org' }))
    expect(url.searchParams.get('login_hint')).toBe('board@mp.org')
  })

  it('throws when the client id is missing', () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID
    expect(() => buildConsentUrl({ state: 's' })).toThrow(/GOOGLE_OAUTH_CLIENT_ID/)
  })
})

describe('exchangeCode', () => {
  it('returns tokens and an absolute expiry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            access_token: 'at-1',
            refresh_token: 'rt-1',
            expires_in: 3599,
            scope: GMAIL_SCOPES.join(' '),
          }),
          { status: 200 },
        ),
      ),
    )

    const before = Date.now()
    const tokens = await exchangeCode('auth-code')

    expect(tokens.accessToken).toBe('at-1')
    expect(tokens.refreshToken).toBe('rt-1')
    expect(new Date(tokens.expiresAt).getTime()).toBeGreaterThan(before)
  })

  it('throws MailboxAuthError on a rejected code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
      ),
    )
    await expect(exchangeCode('bad')).rejects.toBeInstanceOf(MailboxAuthError)
  })
})

// Error classification matters beyond "does it throw": MailboxAuthError is
// a signal the sync job uses to STOP retrying and mark the mailbox
// auth_failed, demanding the HOA reconnect. A transient failure (a Google
// outage, a bad gateway) must come back as a generic Error, or a blip
// becomes a support ticket. Exercised via exchangeCode since postToken
// itself isn't exported.
describe('postToken error classification', () => {
  it('does NOT classify a 500 as MailboxAuthError, and the message contains the status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    const err: unknown = await exchangeCode('code').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(MailboxAuthError)
    expect((err as Error).message).toContain('500')
  })

  it('does NOT classify a 503 as MailboxAuthError, and the message contains the status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    const err: unknown = await exchangeCode('code').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(MailboxAuthError)
    expect((err as Error).message).toContain('503')
  })

  it('classifies a 400 invalid_grant as MailboxAuthError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
      ),
    )
    await expect(exchangeCode('code')).rejects.toBeInstanceOf(MailboxAuthError)
  })

  it('classifies a 401 carrying an OAuth error field as MailboxAuthError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'invalid_client' }), { status: 401 }),
      ),
    )
    await expect(exchangeCode('code')).rejects.toBeInstanceOf(MailboxAuthError)
  })

  it('does NOT classify a 429 as MailboxAuthError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 })),
    )
    const err: unknown = await exchangeCode('code').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(MailboxAuthError)
  })

  it('wraps a non-JSON error body as a generic Error mentioning the status, not a raw SyntaxError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>502 Bad Gateway</html>', { status: 502 })),
    )
    const err: unknown = await exchangeCode('code').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(MailboxAuthError)
    expect(err).not.toBeInstanceOf(SyntaxError)
    expect((err as Error).message).toContain('502')
  })

  it('treats a 200 with no access_token and no error as a generic Error, not MailboxAuthError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })))
    const err: unknown = await exchangeCode('code').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(MailboxAuthError)
  })
})

describe('refreshAccessToken', () => {
  it('preserves the original refresh token when Google omits it', async () => {
    // Google does NOT return refresh_token on a refresh call. Dropping it
    // would erase our only long-lived credential.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ access_token: 'at-2', expires_in: 3599, scope: 's' }),
          { status: 200 },
        ),
      ),
    )
    const tokens = await refreshAccessToken('rt-original')
    expect(tokens.accessToken).toBe('at-2')
    expect(tokens.refreshToken).toBe('rt-original')
  })

  it('throws MailboxAuthError when the refresh token is revoked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
      ),
    )
    await expect(refreshAccessToken('revoked')).rejects.toBeInstanceOf(MailboxAuthError)
  })
})
