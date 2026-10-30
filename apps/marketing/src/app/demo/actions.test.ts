import { afterEach, describe, expect, it, vi } from 'vitest'

const send = vi.fn()
vi.mock('resend', () => ({ Resend: vi.fn(() => ({ emails: { send } })) }))
vi.mock('@homeowner-portal/observability/outbound-guard', () => ({
  guardRecipients: (_c: string, to: string[]) => ({ allowed: to }),
}))

const { submitDemoRequest } = await import('./actions')

function form(fields: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}
const valid = { name: 'Pat Board', email: 'pat@example.org', hoa: 'Peach Demo Commons' }

afterEach(() => {
  vi.unstubAllEnvs()
  send.mockReset()
})

describe('submitDemoRequest', () => {
  it('in production without RESEND_API_KEY, fails loudly instead of losing the request', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('RESEND_API_KEY', '')
    const r = await submitDemoRequest({ status: 'idle' }, form(valid))
    expect(r.status).toBe('error')
    expect(send).not.toHaveBeenCalled()
  })

  it('outside production without a key, logs and succeeds (local development)', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('RESEND_API_KEY', '')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const r = await submitDemoRequest({ status: 'idle' }, form(valid))
    expect(r.status).toBe('success')
    log.mockRestore()
  })

  it('with a key, emails the demo inbox with reply-to set to the visitor', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('DEMO_INBOX_EMAIL', 'inbox@example.org')
    send.mockResolvedValue({ error: null })
    const r = await submitDemoRequest({ status: 'idle' }, form(valid))
    expect(r.status).toBe('success')
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'inbox@example.org', replyTo: valid.email }))
  })

  it('puts the optional county and number of homes in the email', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('DEMO_INBOX_EMAIL', 'inbox@example.org')
    send.mockResolvedValue({ error: null })
    const r = await submitDemoRequest({ status: 'idle' }, form({ ...valid, county: 'Fulton', homes: '120' }))
    expect(r.status).toBe('success')
    const text = send.mock.calls[0]![0].text as string
    expect(text).toMatch(/County:\s+Fulton/)
    expect(text).toMatch(/Homes:\s+120/)
  })

  it('accepts a request without county or homes, and says so in the email', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('DEMO_INBOX_EMAIL', 'inbox@example.org')
    send.mockResolvedValue({ error: null })
    const r = await submitDemoRequest({ status: 'idle' }, form({ ...valid, county: '', homes: '' }))
    expect(r.status).toBe('success')
    expect(send.mock.calls[0]![0].text).toMatch(/County:\s+not given/)
  })

  it('rejects a non-numeric number of homes with a field error', async () => {
    const r = await submitDemoRequest({ status: 'idle' }, form({ ...valid, homes: 'about 100' }))
    expect(r).toMatchObject({ status: 'error', fieldErrors: { homes: expect.any(String) } })
    expect(send).not.toHaveBeenCalled()
  })

  it('rejects a filled honeypot without sending', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    const r = await submitDemoRequest({ status: 'idle' }, form({ ...valid, website: 'http://spam.example' }))
    expect(r.status).toBe('error')
    expect(send).not.toHaveBeenCalled()
  })

  it('on a validation error, echoes what was typed (never the honeypot) so the form is not wiped', async () => {
    const r = await submitDemoRequest(
      { status: 'idle' },
      form({ ...valid, email: 'not-an-email', county: 'Fulton', website: 'bot' }),
    )
    expect(r.status).toBe('error')
    if (r.status !== 'error') return
    expect(r.fieldErrors?.email).toBeTruthy()
    expect(r.values).toMatchObject({ name: valid.name, email: 'not-an-email', hoa: valid.hoa, county: 'Fulton' })
    expect(r.values).not.toHaveProperty('website')
  })
})
