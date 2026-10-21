import { createHash, createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

// BL-146: the Vonage delivery-receipt webhook. The row update is mocked
// (lib/sms-status.test.ts covers it); this pins the route's flag, its
// signature check (the same signed-webhook JWT + payload_hash as the
// inbound route), envelopes and logs. No real SMS, no real database.

const h = vi.hoisted(() => ({ apply: vi.fn() }))
vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: () => ({
    from: () => {
      throw new Error('no db in this test')
    },
  }),
}))
vi.mock('@/lib/sms-status', async (orig) => ({
  ...(await orig<typeof import('@/lib/sms-status')>()),
  applySmsStatus: (...a: unknown[]) => h.apply(...a),
}))

const { POST } = await import('./route')

const SECRET = 'vonage-signature-secret'
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const now = () => Math.floor(Date.now() / 1000)

function jwt(claims: Record<string, unknown>, secret = SECRET, alg = 'HS256'): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const head = enc({ alg, typ: 'JWT' })
  const body = enc(claims)
  return `${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`
}

function receipt(status: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    message_uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    to: '14045551234',
    from: '14045550000',
    timestamp: '2026-10-21T10:05:00Z',
    status,
    channel: 'sms',
    ...extra,
  })
}

function req(body: string, auth: string | null = `Bearer ${jwt({ iat: now(), payload_hash: sha(body) })}`) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (auth) headers.authorization = auth
  return new Request('https://hoa.test/api/webhooks/vonage/status', { method: 'POST', body, headers })
}

let info: ReturnType<typeof vi.spyOn>
let warn: ReturnType<typeof vi.spyOn>
let error: ReturnType<typeof vi.spyOn>
const logged = () => JSON.stringify([...info.mock.calls, ...warn.mock.calls, ...error.mock.calls])

beforeEach(() => {
  vi.stubEnv('SMS_STATUS_WEBHOOK_ENABLED', 'true')
  vi.stubEnv('VONAGE_SIGNATURE_SECRET', SECRET)
  vi.stubEnv('VONAGE_API_KEY', '')
  h.apply.mockReset().mockResolvedValue({ updated: 1 })
  info = vi.spyOn(console, 'info').mockImplementation(() => {})
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('POST /api/webhooks/vonage/status', () => {
  it('flag off (the default): 404, nothing written', async () => {
    vi.stubEnv('SMS_STATUS_WEBHOOK_ENABLED', '')
    const res = await POST(req(receipt('delivered')))
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('not_found')
    expect(h.apply).not.toHaveBeenCalled()
  })

  it('no signature secret: 503 not_configured', async () => {
    vi.stubEnv('VONAGE_SIGNATURE_SECRET', '')
    const res = await POST(req(receipt('delivered')))
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('not_configured')
  })

  it('unsigned: 401 missing_signature, nothing written', async () => {
    const res = await POST(req(receipt('delivered'), null))
    expect(res.status).toBe(401)
    expect((await res.json()).error).toMatchObject({ code: 'unauthenticated', reason: 'missing_signature' })
    expect(h.apply).not.toHaveBeenCalled()
  })

  it('wrong secret, wrong alg, stale token, wrong api key or a swapped body: 401', async () => {
    const body = receipt('delivered')
    const cases: Array<[Request, string]> = [
      [req(body, `Bearer ${jwt({ iat: now(), payload_hash: sha(body) }, 'wrong')}`), 'invalid_signature'],
      [req(body, `Bearer ${jwt({ iat: now(), payload_hash: sha(body) }, SECRET, 'none')}`), 'invalid_signature'],
      [req(body, `Bearer ${jwt({ iat: now() - 2 * 24 * 3600, payload_hash: sha(body) })}`), 'expired'],
      [req(receipt('failed'), `Bearer ${jwt({ iat: now(), payload_hash: sha(body) })}`), 'payload_mismatch'],
      [req(body, `Bearer ${jwt({ iat: now() })}`), 'payload_mismatch'],
      [req(body, 'Basic abc'), 'missing_signature'],
    ]
    for (const [r, reason] of cases) {
      const res = await POST(r)
      expect(res.status, reason).toBe(401)
      expect((await res.json()).error.reason).toBe(reason)
    }
    vi.stubEnv('VONAGE_API_KEY', 'key-1')
    const otherKey = await POST(req(body, `Bearer ${jwt({ iat: now(), payload_hash: sha(body), api_key: 'key-2' })}`))
    expect(otherKey.status).toBe(401)
    expect(h.apply).not.toHaveBeenCalled()
  })

  it('signed but not JSON: 400 invalid_json', async () => {
    const res = await POST(req('not json'))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('invalid_json')
  })

  it('delivered: applied by provider id with the event time; logs id, status and count only', async () => {
    const res = await POST(req(receipt('delivered')))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, action: 'delivered', updated: 1 })
    expect(h.apply).toHaveBeenCalledTimes(1)
    expect(h.apply.mock.calls[0][1]).toEqual({
      messageId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      status: 'delivered',
      at: '2026-10-21T10:05:00.000Z',
      errorCode: null,
    })
    expect(logged()).toContain('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
    expect(logged()).not.toContain('4045551234')
    expect(logged()).not.toContain('4045550000')
  })

  it('failure: passes the error code through; the detail is never logged', async () => {
    const body = receipt('undeliverable', { error: { type: 'https://x', title: 1320, detail: 'Number 14045551234 barred' } })
    const res = await POST(req(body))
    expect(res.status).toBe(200)
    expect(h.apply.mock.calls[0][1]).toMatchObject({ status: 'undeliverable', errorCode: '1320' })
    expect(logged()).not.toContain('barred')
  })

  it('a retried receipt is acknowledged (the update is a no-op)', async () => {
    h.apply.mockResolvedValue({ updated: 0 })
    const res = await POST(req(receipt('delivered')))
    expect(await res.json()).toEqual({ ok: true, action: 'delivered', updated: 0 })
  })

  it('statuses that change nothing, other channels and receipts without an id: acknowledged, nothing written', async () => {
    for (const body of [receipt('read'), receipt('delivered', { channel: 'whatsapp' }), receipt('delivered', { message_uuid: null })]) {
      expect(await (await POST(req(body))).json()).toEqual({ ok: true, action: 'ignored' })
    }
    expect(h.apply).not.toHaveBeenCalled()
  })

  it('a persistence failure answers 500 so Vonage retries, with no raw text', async () => {
    const { ApiRouteError } = await import('@/lib/api/errors')
    h.apply.mockRejectedValue(new ApiRouteError('internal'))
    const res = await POST(req(receipt('delivered')))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('4045551234')
  })
})
