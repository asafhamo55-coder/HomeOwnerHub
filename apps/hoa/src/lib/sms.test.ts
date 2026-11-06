import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeTwilio } from '@/lib/test-utils/fake-twilio'

/**
 * BL-102 finding 2: a missing Twilio variable used to be able to return
 * { ok: true, messageSid: null }, so a text row read "sent" while nothing
 * went out. fetch is faked; nothing here reaches a real provider.
 */

const smsSend = vi.fn()

const ALLOWED = '+15550100001'

async function load() {
  vi.resetModules()
  return import('./sms')
}

function stubAll(over: Record<string, string> = {}) {
  vi.stubEnv('VERCEL_ENV', 'preview')
  vi.stubEnv('OUTBOUND_ALLOWLIST', ALLOWED)
  vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACtest')
  vi.stubEnv('TWILIO_AUTH_TOKEN', 'token')
  vi.stubEnv('TWILIO_MESSAGING_SERVICE_SID', 'MGtest')
  for (const [k, v] of Object.entries(over)) vi.stubEnv(k, v)
}

beforeEach(() => {
  smsSend.mockReset()
  smsSend.mockResolvedValue({ sid: 'SM1' })
  installFakeTwilio(smsSend)
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('sendSms when Twilio is not fully configured', () => {
  for (const missing of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_MESSAGING_SERVICE_SID']) {
    it(`fails with "SMS not configured" when ${missing} is unset, and sends nothing`, async () => {
      stubAll({ [missing]: '' })
      const { sendSms, smsConfigured, SMS_NOT_CONFIGURED } = await load()
      expect(SMS_NOT_CONFIGURED).toBe('SMS not configured')
      expect(smsConfigured()).toBe(false)
      const result = await sendSms({ to: ALLOWED, body: 'Water off Thursday' })
      expect(result).toEqual({ ok: false, error: 'SMS not configured' })
      expect(smsSend).not.toHaveBeenCalled()
    })
  }

  it('logs nothing about the number or the message', async () => {
    stubAll({ TWILIO_AUTH_TOKEN: '' })
    const spies = (['log', 'info', 'warn', 'error'] as const).map((k) => vi.spyOn(console, k))
    const { sendSms } = await load()
    await sendSms({ to: ALLOWED, body: 'Water off Thursday' })
    for (const s of spies) expect(s).not.toHaveBeenCalled()
    for (const s of spies) s.mockRestore()
  })
})

describe('sendSms StatusCallback follows SMS_STATUS_WEBHOOK_ENABLED', () => {
  it('is sent when the status webhook is on', async () => {
    stubAll({ SMS_STATUS_WEBHOOK_ENABLED: 'true', NEXT_PUBLIC_APP_URL: 'https://www.homeownerledger.com' })
    const { sendSms } = await load()
    await sendSms({ to: ALLOWED, body: 'x' })
    expect(smsSend.mock.calls[0][0].form.StatusCallback).toBe('https://www.homeownerledger.com/api/webhooks/twilio/status')
  })
  it('is left out when the flag is off or unset', async () => {
    for (const v of ['', 'false']) {
      smsSend.mockClear()
      stubAll({ SMS_STATUS_WEBHOOK_ENABLED: v })
      const { sendSms } = await load()
      await sendSms({ to: ALLOWED, body: 'x' })
      expect(smsSend.mock.calls[0][0].form).not.toHaveProperty('StatusCallback')
    }
  })
})

describe('sendSms when configured', () => {
  it('sends through Twilio and returns the message sid', async () => {
    stubAll()
    smsSend.mockResolvedValue({ sid: 'SMabc' })
    const { sendSms, smsConfigured } = await load()
    expect(smsConfigured()).toBe(true)
    expect(await sendSms({ to: ALLOWED, body: 'Water off Thursday' })).toEqual({ ok: true, messageSid: 'SMabc' })
    expect(smsSend).toHaveBeenCalledTimes(1)
  })

  it('still passes the outbound guard first: a number off the allowlist is blocked', async () => {
    stubAll()
    const { sendSms } = await load()
    const result = await sendSms({ to: '+15550100002', body: 'x' })
    expect(result.ok).toBe(false)
    expect(smsSend).not.toHaveBeenCalled()
  })
})

describe('maskPhoneNumbers (security review #3, SEC3-L7)', () => {
  it('masks contiguous and formatted phone numbers, and leaves short numbers alone', async () => {
    const { maskPhoneNumbers } = await load()
    for (const n of [
      '14045550100',
      '+14045550100',
      '+1 404-555-0100',
      '404-555-0100',
      '404.555.0100',
      '(404) 555-0100',
      '+1 (404) 555 0100',
      '555-0100',
    ]) {
      expect(maskPhoneNumbers(`Destination ${n} is not whitelisted`), n).toBe('Destination [number] is not whitelisted')
    }
    expect(maskPhoneNumbers('Request failed with status code 422')).toBe('Request failed with status code 422')
    expect(maskPhoneNumbers('error 1120: Invalid sender')).toBe('error 1120: Invalid sender')
    expect(maskPhoneNumbers('to +1 404-555-0100 and 678.555.0199')).toBe('to [number] and [number]')
  })
})

describe('sendSms opt-out line', () => {
  async function sentBody(body: string) {
    stubAll()
    const { sendSms } = await load()
    await sendSms({ to: ALLOWED, body })
    return smsSend.mock.calls[0][0].form.Body as string
  }

  it('adds " Reply STOP to opt out." to a normal body', async () => {
    expect(await sentBody('Water off Thursday')).toBe('Water off Thursday Reply STOP to opt out.')
  })

  it('does not add it twice for a body that already ends with it', async () => {
    const already = 'Water off Thursday Reply STOP to opt out.'
    expect(await sentBody(already)).toBe(already)
  })

  it('shortens a long body, keeps the STOP line and never exceeds 279', async () => {
    const sent = await sentBody('w'.repeat(500))
    expect(sent).toHaveLength(279)
    expect(sent.endsWith('\u2026 Reply STOP to opt out.')).toBe(true)
  })

  it('a composed body with a portal link passes through unchanged', async () => {
    const { composeSmsBody } = await import('@/lib/communications/sms-body')
    const link = 'https://www.homeownerledger.com/communications/3f2b8c1e-0000-4000-8000-000000000000'
    const composed = composeSmsBody({ subject: 'Meeting', body: 'x'.repeat(600), portalLink: link })
    const sent = await sentBody(composed)
    expect(sent).toBe(composed)
    expect(sent).toContain(link)
  })
})
