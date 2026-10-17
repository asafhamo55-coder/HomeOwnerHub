import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * getReceivedEmail: Resend's `email.received` webhook carries metadata only
 * (resend 6.x ReceivedEmailEventData: email_id, from, to, subject,
 * message_id, attachments — no headers, no body). The threading headers and
 * text come from GET /emails/receiving/{id}. Resend is mocked; no network.
 */
const get = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: vi.fn(), receiving: { get } }
  },
}))

async function fresh() {
  vi.resetModules()
  return (await import('./email')).getReceivedEmail
}

const saved = process.env.RESEND_API_KEY
beforeEach(() => {
  get.mockReset()
  process.env.RESEND_API_KEY = 'test-key'
})
afterEach(() => {
  if (saved === undefined) delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = saved
})

describe('getReceivedEmail', () => {
  it('returns headers (lower-cased keys), text and html', async () => {
    get.mockResolvedValue({
      data: { headers: { 'In-Reply-To': '<a@b>', References: '<c@d> <a@b>' }, text: 'hi', html: '<p>hi</p>' },
      error: null,
    })
    const r = await (await fresh())('inb-1')
    expect(get).toHaveBeenCalledWith('inb-1')
    expect(r).toEqual({
      ok: true,
      email: { headers: { 'in-reply-to': '<a@b>', references: '<c@d> <a@b>' }, text: 'hi', html: '<p>hi</p>' },
    })
  })

  it('no API key → not_configured, without calling Resend', async () => {
    delete process.env.RESEND_API_KEY
    expect(await (await fresh())('inb-1')).toEqual({ ok: false, reason: 'not_configured' })
    expect(get).not.toHaveBeenCalled()
  })

  it('a Resend error or throw → upstream, with no provider text', async () => {
    get.mockResolvedValueOnce({ data: null, error: { message: 'secret provider text', statusCode: 500 } })
    expect(await (await fresh())('inb-1')).toEqual({ ok: false, reason: 'upstream' })
    get.mockRejectedValueOnce(new Error('socket hang up secret'))
    expect(await (await fresh())('inb-1')).toEqual({ ok: false, reason: 'upstream' })
  })

  it('a not-found email id → not_found', async () => {
    get.mockResolvedValue({ data: null, error: { message: 'Email not found', statusCode: 404, name: 'not_found' } })
    expect(await (await fresh())('inb-x')).toEqual({ ok: false, reason: 'not_found' })
  })
})
