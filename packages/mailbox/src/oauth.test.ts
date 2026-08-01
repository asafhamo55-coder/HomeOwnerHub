import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildConsentUrl,
  exchangeCode,
  GMAIL_SCOPES,
  refreshAccessToken,
  revokeToken,
} from './oauth'
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

  it('treats a 400 with no error field as a generic Error, not MailboxAuthError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 400 })))
    const err: unknown = await exchangeCode('code').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(MailboxAuthError)
    expect((err as Error).message).toContain('400')
  })

  it('treats a 401 with no error field as a generic Error, not MailboxAuthError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 401 })))
    const err: unknown = await exchangeCode('code').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(MailboxAuthError)
    expect((err as Error).message).toContain('401')
  })

  it('treats a 403 as a generic Error, not MailboxAuthError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 403 })))
    const err: unknown = await exchangeCode('code').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(MailboxAuthError)
    expect((err as Error).message).toContain('403')
  })

  it('classifies a 200 carrying invalid_grant (credential rejection) as MailboxAuthError, not success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'invalid_grant', access_token: 'at-1' }), {
          status: 200,
        }),
      ),
    )
    const err: unknown = await exchangeCode('code').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(MailboxAuthError)
  })

  it('classifies a 200 carrying temporarily_unavailable as a generic Error, not MailboxAuthError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'temporarily_unavailable', access_token: 'at-1' }), {
          status: 200,
        }),
      ),
    )
    const err: unknown = await exchangeCode('code').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(MailboxAuthError)
  })

  it('includes Google error text in the message for non-credential-rejection errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'rate_limited', error_description: 'Too many requests' }), {
          status: 429,
        }),
      ),
    )
    const err: unknown = await exchangeCode('code').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(MailboxAuthError)
    expect((err as Error).message).toContain('Too many requests')
  })

  it('includes Google error code when error_description is not provided', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400 }),
      ),
    )
    const err: unknown = await exchangeCode('code').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(MailboxAuthError)
    expect((err as Error).message).toContain('invalid_request')
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

describe('revokeToken', () => {
  it('posts the token to Google’s revocation endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await revokeToken('rt-1')

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://oauth2.googleapis.com/revoke')
    expect(init.method).toBe('POST')
    expect(String(init.body)).toBe('token=rt-1')
  })

  it('needs no client credentials — revocation authenticates on the token alone', async () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })))
    await expect(revokeToken('rt-1')).resolves.toBeUndefined()
  })

  it('treats an already-revoked grant as success, not failure', async () => {
    // The caller wants an END STATE ("this grant is gone"), not a state
    // transition. A user who already revoked us in their Google account
    // must still get a clean disconnect.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'invalid_token' }), { status: 400 }),
      ),
    )
    await expect(revokeToken('already-gone')).resolves.toBeUndefined()
  })

  it('throws on a real server-side failure so the caller can log it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })))
    await expect(revokeToken('rt-1')).rejects.toThrow(/revocation failed \(502\)/)
  })

  it('throws — never silently succeeds — on a 400 that is not invalid_token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400 }),
      ),
    )
    await expect(revokeToken('rt-1')).rejects.toThrow(/invalid_request/)
  })
})
