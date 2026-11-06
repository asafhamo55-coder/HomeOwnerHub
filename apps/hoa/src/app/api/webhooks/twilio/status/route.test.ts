import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

// BL-146: the Twilio delivery-receipt (StatusCallback) webhook. The row
// update is mocked (lib/sms-status.test.ts covers it); this pins the
// route's flag, its X-Twilio-Signature check, envelopes and logs. No real
// SMS, no real database.

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

const TOKEN = 'twilio-auth-token'
const PUBLIC_URL = 'https://www.homeownerledger.com/api/webhooks/twilio/status'
const SID = 'SMaaaaaaaabbbb4ccc8ddd0123456789ab'

function sign(url: string, fields: Record<string, string>, token = TOKEN): string {
  const data = Object.keys(fields)
    .sort()
    .reduce((acc, k) => acc + k + fields[k], url)
  return createHmac('sha1', token).update(data, 'utf8').digest('base64')
}

function receipt(status: string, extra: Record<string, string> = {}): Record<string, string> {
  return { MessageSid: SID, MessageStatus: status, To: '+14045551234', From: '+14045550000', AccountSid: 'ACtest', ...extra }
}

function req(
  fields: Record<string, string>,
  opts: { signature?: string | null; url?: string; requestUrl?: string } = {},
) {
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' }
  const signature = opts.signature === undefined ? sign(opts.url ?? PUBLIC_URL, fields) : opts.signature
  if (signature) headers['x-twilio-signature'] = signature
  // The incoming Host is deliberately NOT the public host: it must not matter.
  return new Request(opts.requestUrl ?? 'https://hoa-abc123.vercel.app/api/webhooks/twilio/status', {
    method: 'POST',
    body: new URLSearchParams(fields).toString(),
    headers,
  })
}

let info: ReturnType<typeof vi.spyOn>
let warn: ReturnType<typeof vi.spyOn>
let error: ReturnType<typeof vi.spyOn>
const logged = () => JSON.stringify([...info.mock.calls, ...warn.mock.calls, ...error.mock.calls])

beforeEach(() => {
  vi.stubEnv('SMS_STATUS_WEBHOOK_ENABLED', 'true')
  vi.stubEnv('TWILIO_AUTH_TOKEN', TOKEN)
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.homeownerledger.com')
  h.apply.mockReset().mockResolvedValue({ updated: 1 })
  info = vi.spyOn(console, 'info').mockImplementation(() => {})
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('POST /api/webhooks/twilio/status', () => {
  it('flag off (the default): 404, nothing written', async () => {
    vi.stubEnv('SMS_STATUS_WEBHOOK_ENABLED', '')
    const res = await POST(req(receipt('delivered')))
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('not_found')
    expect(h.apply).not.toHaveBeenCalled()
  })

  it('no auth token: 503 not_configured', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', '')
    const res = await POST(req(receipt('delivered')))
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('not_configured')
  })

  it('missing signature: 403 forbidden, nothing written', async () => {
    const res = await POST(req(receipt('delivered'), { signature: null }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatchObject({ code: 'forbidden', reason: 'missing_signature' })
    expect(h.apply).not.toHaveBeenCalled()
  })

  it('wrong token, tampered field, or signed for another URL: 403, only a code is logged', async () => {
    const good = receipt('delivered')
    const cases: Array<[Request, string]> = [
      [req(good, { signature: sign(PUBLIC_URL, good, 'wrong') }), 'wrong token'],
      [req({ ...good, MessageStatus: 'failed' }, { signature: sign(PUBLIC_URL, good) }), 'tampered field'],
      [req(good, { url: 'https://evil.example/api/webhooks/twilio/status' }), 'wrong url'],
      [req(good, { url: 'https://www.homeownerledger.com/api/webhooks/twilio/inbound' }), 'other route'],
    ]
    for (const [r, why] of cases) {
      const res = await POST(r)
      expect(res.status, why).toBe(403)
      expect((await res.json()).error.reason, why).toBe('invalid_signature')
    }
    expect(h.apply).not.toHaveBeenCalled()
    expect(logged()).not.toContain('4045551234')
  })

  it('validates against the configured public origin, not the incoming Host', async () => {
    const good = receipt('delivered')
    // Signed for the public URL, delivered via a vercel.app host: accepted.
    expect((await POST(req(good))).status).toBe(200)
    // Signed for the vercel.app host (what a spoofed Host header would give): refused.
    const spoof = await POST(req(good, { url: 'https://hoa-abc123.vercel.app/api/webhooks/twilio/status' }))
    expect(spoof.status).toBe(403)
  })

  it('a query string on the request is part of the signed URL', async () => {
    const good = receipt('delivered')
    const withQuery = req(good, {
      url: `${PUBLIC_URL}?a=1`,
      requestUrl: 'https://hoa-abc123.vercel.app/api/webhooks/twilio/status?a=1',
    })
    expect((await POST(withQuery)).status).toBe(200)
  })

  it('delivered: applied by MessageSid; logs id, status and count only', async () => {
    const res = await POST(req(receipt('delivered')))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, action: 'delivered', updated: 1 })
    expect(h.apply).toHaveBeenCalledTimes(1)
    expect(h.apply.mock.calls[0][1]).toMatchObject({ messageId: SID, status: 'delivered', errorCode: null })
    expect(logged()).toContain(SID)
    expect(logged()).not.toContain('4045551234')
    expect(logged()).not.toContain('4045550000')
  })

  it('failure: passes ErrorCode through; nothing else about the failure is logged', async () => {
    const res = await POST(req(receipt('undelivered', { ErrorCode: '30003', ErrorMessage: 'barred 14045551234' })))
    expect(res.status).toBe(200)
    expect(h.apply.mock.calls[0][1]).toMatchObject({ status: 'undelivered', errorCode: '30003' })
    expect(logged()).not.toContain('barred')
  })

  it('a retried or out-of-order receipt is acknowledged (the update is a no-op)', async () => {
    h.apply.mockResolvedValue({ updated: 0 })
    const res = await POST(req(receipt('sent')))
    expect(await res.json()).toEqual({ ok: true, action: 'sent', updated: 0 })
  })

  it('statuses that change nothing and receipts without an id: acknowledged, nothing written', async () => {
    for (const fields of [receipt('queued'), receipt('sending'), receipt('delivered', { MessageSid: '' })]) {
      expect(await (await POST(req(fields))).json()).toEqual({ ok: true, action: 'ignored' })
    }
    expect(h.apply).not.toHaveBeenCalled()
  })

  it('a persistence failure answers 500 so Twilio retries, with no raw text', async () => {
    const { ApiRouteError } = await import('@/lib/api/errors')
    h.apply.mockRejectedValue(new ApiRouteError('internal'))
    const res = await POST(req(receipt('delivered')))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('4045551234')
  })

  it('an oversized body is refused with 413 before the signature is checked', async () => {
    const big = { ...receipt('delivered'), Pad: 'x'.repeat(70 * 1024) }
    const res = await POST(req(big))
    expect(res.status).toBe(413)
  })
})
