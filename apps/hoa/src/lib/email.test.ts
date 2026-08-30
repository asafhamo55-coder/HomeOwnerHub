import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Pins the seam between sendEmail and sender-name.ts: that `senderName`
 * actually reaches Resend's From field, and that omitting it leaves
 * EMAIL_FROM untouched. sender-name.test.ts covers the formatting rules
 * themselves; this covers the wiring, which is where a silent mistake
 * would otherwise only show up in a resident's inbox.
 *
 * No network — Resend is mocked. `_client` is cached at module scope, so
 * each test resets the module registry and re-imports.
 */
const send = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    emails = { send }
  },
}))

const ENV_FROM = 'HomeownerHub <noreply@homeownerledger.com>'

async function freshSendEmail() {
  vi.resetModules()
  return (await import('./email')).sendEmail
}

describe('sendEmail From header', () => {
  const saved = { from: process.env.EMAIL_FROM, key: process.env.RESEND_API_KEY }

  beforeEach(() => {
    send.mockReset()
    send.mockResolvedValue({ data: { id: 'msg_1' }, error: null })
    process.env.EMAIL_FROM = ENV_FROM
    process.env.RESEND_API_KEY = 'test-key'
  })

  afterEach(() => {
    for (const [k, v] of [['EMAIL_FROM', saved.from], ['RESEND_API_KEY', saved.key]] as const) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  const base = { to: 'r@example.com', subject: 's', html: '<p>h</p>' }

  it('sends as the community when senderName is supplied', async () => {
    const sendEmail = await freshSendEmail()
    await sendEmail({ ...base, senderName: 'Madison Park HOA' })

    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].from).toBe('"Madison Park HOA" <noreply@homeownerledger.com>')
  })

  // This is what keeps platform/staff and vendor mail reading "HomeownerHub".
  it('leaves EMAIL_FROM untouched when senderName is omitted', async () => {
    const sendEmail = await freshSendEmail()
    await sendEmail(base)

    expect(send.mock.calls[0][0].from).toBe(ENV_FROM)
  })

  it('falls back to EMAIL_FROM for a blank senderName', async () => {
    const sendEmail = await freshSendEmail()
    await sendEmail({ ...base, senderName: '' })

    expect(send.mock.calls[0][0].from).toBe(ENV_FROM)
  })

  it('keeps the verified address even as the display name changes', async () => {
    const sendEmail = await freshSendEmail()
    await sendEmail({ ...base, senderName: 'Creek Valley HOA (Demo)' })

    expect(send.mock.calls[0][0].from).toContain('<noreply@homeownerledger.com>')
  })

  it('still reports EMAIL_FROM missing as an error', async () => {
    delete process.env.EMAIL_FROM
    const sendEmail = await freshSendEmail()

    expect(await sendEmail({ ...base, senderName: 'Madison Park HOA' })).toEqual({
      ok: false,
      error: 'EMAIL_FROM is not configured.',
    })
    expect(send).not.toHaveBeenCalled()
  })
})
