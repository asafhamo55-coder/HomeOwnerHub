import { createHash, createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

// BL-111: the Vonage inbound webhook. The keyword work is mocked (its own
// tests live in lib/sms-inbound.test.ts); this pins the route's order,
// flag, signature and envelopes. No real SMS, no real database.

const h = vi.hoisted(() => ({
  stop: vi.fn(),
  start: vi.fn(),
}))
vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: () => ({
    from: () => {
      throw new Error('no db in this test')
    },
  }),
}))
vi.mock('@/lib/sms-inbound', async (orig) => ({
  ...(await orig<typeof import('@/lib/sms-inbound')>()),
  applyStop: (...a: unknown[]) => h.stop(...a),
  applyStart: (...a: unknown[]) => h.start(...a),
}))

const { POST } = await import('./route')

const SECRET = 'vonage-signature-secret'
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

function jwt(claims: Record<string, unknown>, secret = SECRET): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const head = enc({ alg: 'HS256', typ: 'JWT' })
  const body = enc(claims)
  return `${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`
}

function inbound(text: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ channel: 'sms', message_uuid: 'msg-uuid-1', from: '14045551234', to: '14045550000', text, ...extra })
}

function req(body: string, auth: string | null = `Bearer ${jwt({ iat: Math.floor(Date.now() / 1000), payload_hash: sha(body) })}`) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (auth) headers.authorization = auth
  return new Request('https://hoa.test/api/webhooks/vonage/inbound', { method: 'POST', body, headers })
}

let info: ReturnType<typeof vi.spyOn>
let warn: ReturnType<typeof vi.spyOn>
let error: ReturnType<typeof vi.spyOn>
const logged = () => JSON.stringify([...info.mock.calls, ...warn.mock.calls, ...error.mock.calls])

beforeEach(() => {
  vi.stubEnv('SMS_INBOUND_ENABLED', 'true')
  vi.stubEnv('VONAGE_SIGNATURE_SECRET', SECRET)
  vi.stubEnv('VONAGE_API_KEY', '')
  h.stop.mockReset().mockResolvedValue({ matched: 1, changed: 1 })
  h.start.mockReset().mockResolvedValue({ matched: 1, changed: 1 })
  info = vi.spyOn(console, 'info').mockImplementation(() => {})
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('POST /api/webhooks/vonage/inbound', () => {
  it('flag off (the default): 404, nothing read or written', async () => {
    vi.stubEnv('SMS_INBOUND_ENABLED', '')
    const res = await POST(req(inbound('STOP')))
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('not_found')
    expect(h.stop).not.toHaveBeenCalled()
  })

  it('no signature secret: 503 not_configured', async () => {
    vi.stubEnv('VONAGE_SIGNATURE_SECRET', '')
    const res = await POST(req(inbound('STOP')))
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('not_configured')
  })

  it('unsigned: 401, refused before anything is done', async () => {
    const res = await POST(req(inbound('STOP'), null))
    expect(res.status).toBe(401)
    expect((await res.json()).error).toMatchObject({ code: 'unauthenticated', reason: 'missing_signature' })
    expect(h.stop).not.toHaveBeenCalled()
  })

  it('bad signature or a body that does not match the signed hash: 401', async () => {
    const body = inbound('STOP')
    const forged = await POST(req(body, `Bearer ${jwt({ iat: Math.floor(Date.now() / 1000), payload_hash: sha(body) }, 'wrong')}`))
    expect(forged.status).toBe(401)
    const swapped = await POST(req(inbound('START'), `Bearer ${jwt({ iat: Math.floor(Date.now() / 1000), payload_hash: sha(body) })}`))
    expect(swapped.status).toBe(401)
    expect((await swapped.json()).error.reason).toBe('payload_mismatch')
    expect(h.stop).not.toHaveBeenCalled()
    expect(h.start).not.toHaveBeenCalled()
  })

  it('signed but not JSON: 400 invalid_json', async () => {
    const res = await POST(req('not json'))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('invalid_json')
  })

  it('STOP: applied with the sender and message id; logs ids and counts only', async () => {
    const res = await POST(req(inbound('Stop')))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, action: 'stop', matched: 1, changed: 1 })
    expect(h.stop).toHaveBeenCalledTimes(1)
    expect(h.stop.mock.calls[0][1]).toMatchObject({ fromRaw: '14045551234', messageId: 'msg-uuid-1', keyword: 'STOP' })
    expect(logged()).toContain('msg-uuid-1')
    expect(logged()).not.toContain('4045551234')
    expect(logged()).not.toContain('Stop')
  })

  it('START: applied', async () => {
    const res = await POST(req(inbound('START')))
    expect(await res.json()).toMatchObject({ ok: true, action: 'start' })
    expect(h.start).toHaveBeenCalledTimes(1)
    expect(h.stop).not.toHaveBeenCalled()
  })

  it('HELP and ordinary replies: acknowledged, nothing written, nothing sent', async () => {
    expect(await (await POST(req(inbound('HELP')))).json()).toEqual({ ok: true, action: 'help' })
    expect(await (await POST(req(inbound('see you thursday')))).json()).toEqual({ ok: true, action: 'ignored' })
    expect(h.stop).not.toHaveBeenCalled()
    expect(h.start).not.toHaveBeenCalled()
  })

  it('a persistence failure answers 500 so Vonage retries, with no raw text', async () => {
    const { ApiRouteError } = await import('@/lib/api/errors')
    h.stop.mockRejectedValue(new ApiRouteError('internal'))
    const res = await POST(req(inbound('STOP')))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('4045551234')
  })
})
