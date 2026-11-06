import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

// BL-111: the Twilio inbound webhook. The keyword work is mocked (its own
// tests live in lib/sms-inbound.test.ts); this pins the route's order,
// flag, signature, TwiML replies and envelopes. No real SMS, no database.

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

const TOKEN = 'twilio-auth-token'
const PUBLIC_URL = 'https://www.homeownerledger.com/api/webhooks/twilio/inbound'
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response/>'

function sign(url: string, fields: Record<string, string>, token = TOKEN): string {
  const data = Object.keys(fields)
    .sort()
    .reduce((acc, k) => acc + k + fields[k], url)
  return createHmac('sha1', token).update(data, 'utf8').digest('base64')
}

function inbound(body: string, extra: Record<string, string> = {}): Record<string, string> {
  return { MessageSid: 'SMmsg1', From: '+14045551234', To: '+14045550000', Body: body, AccountSid: 'ACtest', ...extra }
}

function req(fields: Record<string, string>, signature: string | null | undefined = undefined, url = PUBLIC_URL) {
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' }
  const sig = signature === undefined ? sign(url, fields) : signature
  if (sig) headers['x-twilio-signature'] = sig
  return new Request('https://hoa-abc123.vercel.app/api/webhooks/twilio/inbound', {
    method: 'POST',
    body: new URLSearchParams(fields).toString(),
    headers,
  })
}

async function expectEmptyTwiml(res: Response) {
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toContain('text/xml')
  expect(await res.text()).toBe(EMPTY_TWIML)
}

let info: ReturnType<typeof vi.spyOn>
let warn: ReturnType<typeof vi.spyOn>
let error: ReturnType<typeof vi.spyOn>
const logged = () => JSON.stringify([...info.mock.calls, ...warn.mock.calls, ...error.mock.calls])

beforeEach(() => {
  vi.stubEnv('SMS_INBOUND_ENABLED', 'true')
  vi.stubEnv('TWILIO_AUTH_TOKEN', TOKEN)
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.homeownerledger.com')
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

describe('POST /api/webhooks/twilio/inbound', () => {
  it('flag off (the default): 404, nothing read or written', async () => {
    vi.stubEnv('SMS_INBOUND_ENABLED', '')
    const res = await POST(req(inbound('STOP')))
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('not_found')
    expect(h.stop).not.toHaveBeenCalled()
  })

  it('no auth token: 503 not_configured', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', '')
    const res = await POST(req(inbound('STOP')))
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('not_configured')
  })

  it('missing signature: 403, refused before anything is done', async () => {
    const res = await POST(req(inbound('STOP'), null))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatchObject({ code: 'forbidden', reason: 'missing_signature' })
    expect(h.stop).not.toHaveBeenCalled()
  })

  it('bad signature, tampered body or wrong URL: 403', async () => {
    const body = inbound('STOP')
    const forged = await POST(req(body, sign(PUBLIC_URL, body, 'wrong')))
    expect(forged.status).toBe(403)
    const swapped = await POST(req(inbound('START'), sign(PUBLIC_URL, body)))
    expect(swapped.status).toBe(403)
    expect((await swapped.json()).error.reason).toBe('invalid_signature')
    const wrongUrl = await POST(req(body, undefined, 'https://hoa-abc123.vercel.app/api/webhooks/twilio/inbound'))
    expect(wrongUrl.status).toBe(403)
    expect(h.stop).not.toHaveBeenCalled()
    expect(h.start).not.toHaveBeenCalled()
    expect(logged()).not.toContain('4045551234')
  })

  it('STOP: applied with the sender and MessageSid; empty TwiML; logs ids and counts only', async () => {
    const res = await POST(req(inbound('Stop')))
    await expectEmptyTwiml(res)
    expect(h.stop).toHaveBeenCalledTimes(1)
    expect(h.stop.mock.calls[0][1]).toMatchObject({ fromRaw: '+14045551234', messageId: 'SMmsg1', keyword: 'STOP' })
    expect(logged()).toContain('SMmsg1')
    expect(logged()).not.toContain('4045551234')
    expect(logged()).not.toContain('Stop')
  })

  it('START: applied, empty TwiML', async () => {
    await expectEmptyTwiml(await POST(req(inbound('START'))))
    expect(h.start).toHaveBeenCalledTimes(1)
    expect(h.stop).not.toHaveBeenCalled()
  })

  it('OptOutType wins over the body: STOP / START when Twilio says so', async () => {
    await expectEmptyTwiml(await POST(req(inbound('please no more', { OptOutType: 'STOP' }))))
    expect(h.stop).toHaveBeenCalledTimes(1)
    await expectEmptyTwiml(await POST(req(inbound('yes', { OptOutType: 'START' }))))
    expect(h.start).toHaveBeenCalledTimes(1)
  })

  it('an OptOutType alone (empty body) still records the opt-out under that word', async () => {
    await expectEmptyTwiml(await POST(req(inbound('', { OptOutType: 'STOP' }))))
    expect(h.stop.mock.calls[0][1]).toMatchObject({ keyword: 'STOP' })
  })

  it('HELP and ordinary replies: empty TwiML, nothing written, nothing sent', async () => {
    await expectEmptyTwiml(await POST(req(inbound('HELP'))))
    await expectEmptyTwiml(await POST(req(inbound('help me', { OptOutType: 'HELP' }))))
    await expectEmptyTwiml(await POST(req(inbound('see you thursday'))))
    expect(h.stop).not.toHaveBeenCalled()
    expect(h.start).not.toHaveBeenCalled()
  })

  it('WhatsApp senders are ignored', async () => {
    await expectEmptyTwiml(await POST(req(inbound('STOP', { From: 'whatsapp:+14045551234' }))))
    expect(h.stop).not.toHaveBeenCalled()
  })

  it('a keyword without a MessageSid is acknowledged, not retried', async () => {
    await expectEmptyTwiml(await POST(req(inbound('STOP', { MessageSid: '' }))))
    expect(h.stop).not.toHaveBeenCalled()
  })

  it('a persistence failure answers 500 so Twilio retries, with no raw text', async () => {
    const { ApiRouteError } = await import('@/lib/api/errors')
    h.stop.mockRejectedValue(new ApiRouteError('internal'))
    const res = await POST(req(inbound('STOP')))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('4045551234')
  })
})
