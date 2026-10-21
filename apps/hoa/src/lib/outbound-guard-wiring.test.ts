import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OUTBOUND_BLOCKED_ERROR } from '@homeowner-portal/observability/outbound-guard'

/**
 * BL-004 wiring: sendEmail, sendEmailBatch and sendSms each consult the
 * outbound guard BEFORE the provider SDK is called. The guard's own rules
 * are covered in packages/observability/src/outbound-guard.test.ts; this
 * proves the HOA transports actually obey them. Providers are mocked, so a
 * failing assertion here never becomes a real send.
 */

const emailSend = vi.fn()
const batchSend = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: emailSend }
    batch = { send: batchSend }
  },
}))

const smsSend = vi.fn()
vi.mock('@vonage/server-sdk', () => ({
  Vonage: class {
    messages = { send: smsSend }
  },
}))

const RESIDENT = 'resident@gmail.com'
const OWNER = 'owner@example.test'

async function freshEmail() {
  vi.resetModules()
  return import('./email')
}
async function freshSms() {
  vi.resetModules()
  return import('./sms')
}

beforeEach(() => {
  vi.stubEnv('EMAIL_FROM', 'HomeownerHub <noreply@homeownerledger.com>')
  vi.stubEnv('RESEND_API_KEY', 'test-key')
  vi.stubEnv('VONAGE_API_KEY', 'k')
  vi.stubEnv('VONAGE_API_SECRET', 's')
  vi.stubEnv('VONAGE_FROM_NUMBER', '15550000000')
  vi.stubEnv('OUTBOUND_ALLOWLIST', '@example.test,+1 404 555 1234')
  emailSend.mockResolvedValue({ data: { id: 'msg_1' }, error: null })
  smsSend.mockResolvedValue({ messageUUID: 'sms_1' })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const mail = (to: string) => ({ to, subject: 'Pool closed', html: '<p>x</p>' })

describe('sendEmail', () => {
  it('in preview, blocks a resident and never calls Resend', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const { sendEmail } = await freshEmail()
    const result = await sendEmail(mail(RESIDENT))
    expect(result).toEqual({ ok: false, error: OUTBOUND_BLOCKED_ERROR })
    expect(emailSend).not.toHaveBeenCalled()
  })

  it('locally (VERCEL_ENV unset), blocks a resident', async () => {
    vi.stubEnv('VERCEL_ENV', '')
    delete process.env.VERCEL_ENV
    const { sendEmail } = await freshEmail()
    expect((await sendEmail(mail(RESIDENT))).ok).toBe(false)
    expect(emailSend).not.toHaveBeenCalled()
  })

  it('in preview, delivers to an allowlisted address', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const { sendEmail } = await freshEmail()
    expect(await sendEmail(mail(OWNER))).toEqual({ ok: true, messageId: 'msg_1' })
    expect(emailSend).toHaveBeenCalledTimes(1)
  })

  it('in production, delivers to a resident', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const { sendEmail } = await freshEmail()
    expect((await sendEmail(mail(RESIDENT))).ok).toBe(true)
    expect(emailSend.mock.calls[0][0].to).toBe(RESIDENT)
  })

  it('in production, an org in sandbox mode blocks a resident', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const { sendEmail } = await freshEmail()
    const result = await sendEmail(mail(RESIDENT), { orgSandbox: true })
    expect(result.ok).toBe(false)
    expect(emailSend).not.toHaveBeenCalled()
  })

  it('blocks even when RESEND_API_KEY is missing (no "skipped = success" for a resident)', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    delete process.env.RESEND_API_KEY
    const { sendEmail } = await freshEmail()
    expect(await sendEmail(mail(RESIDENT))).toEqual({ ok: false, error: OUTBOUND_BLOCKED_ERROR })
  })
})

describe('sendEmailBatch', () => {
  it('in preview, sends only allowlisted recipients and keeps results positional', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    batchSend.mockResolvedValue({ data: { data: [{ id: 'b1' }], errors: [] }, error: null })
    const { sendEmailBatch } = await freshEmail()

    const results = await sendEmailBatch([mail(RESIDENT), mail(OWNER), mail('neighbour@yahoo.com')])

    expect(batchSend).toHaveBeenCalledTimes(1)
    const payload = batchSend.mock.calls[0][0] as { to: string }[]
    expect(payload.map((p) => p.to)).toEqual([OWNER])
    expect(results).toEqual([
      { ok: false, error: OUTBOUND_BLOCKED_ERROR },
      { ok: true, messageId: 'b1' },
      { ok: false, error: OUTBOUND_BLOCKED_ERROR },
    ])
  })

  it('in preview, an all-resident batch never calls Resend', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const { sendEmailBatch } = await freshEmail()
    const results = await sendEmailBatch([mail(RESIDENT), mail('b@yahoo.com')])
    expect(batchSend).not.toHaveBeenCalled()
    expect(results.every((r) => !r.ok)).toBe(true)
  })

  it('in production, sends everyone', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    batchSend.mockResolvedValue({
      data: { data: [{ id: 'b1' }, { id: 'b2' }], errors: [] },
      error: null,
    })
    const { sendEmailBatch } = await freshEmail()
    const results = await sendEmailBatch([mail(RESIDENT), mail(OWNER)])
    expect((batchSend.mock.calls[0][0] as unknown[]).length).toBe(2)
    expect(results.every((r) => r.ok)).toBe(true)
  })

  it('in production, an org in sandbox mode blocks residents', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const { sendEmailBatch } = await freshEmail()
    const results = await sendEmailBatch([mail(RESIDENT)], { orgSandbox: true })
    expect(batchSend).not.toHaveBeenCalled()
    expect(results).toEqual([{ ok: false, error: OUTBOUND_BLOCKED_ERROR }])
  })
})

describe('sendSms', () => {
  it('in preview, blocks a resident phone and never calls Vonage', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const { sendSms } = await freshSms()
    const result = await sendSms({ to: '+15559876543', body: 'hi' })
    expect(result).toEqual({ ok: false, error: OUTBOUND_BLOCKED_ERROR })
    expect(smsSend).not.toHaveBeenCalled()
  })

  it('in preview, delivers to an allowlisted phone', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const { sendSms } = await freshSms()
    expect((await sendSms({ to: '+14045551234', body: 'hi' })).ok).toBe(true)
    expect(smsSend).toHaveBeenCalledTimes(1)
  })

  it('in production, delivers to a resident phone', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const { sendSms } = await freshSms()
    expect((await sendSms({ to: '+15559876543', body: 'hi' })).ok).toBe(true)
  })

  it('in production, an org in sandbox mode blocks a resident phone', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const { sendSms } = await freshSms()
    expect((await sendSms({ to: '+15559876543', body: 'hi' }, { orgSandbox: true })).ok).toBe(false)
    expect(smsSend).not.toHaveBeenCalled()
  })
})
