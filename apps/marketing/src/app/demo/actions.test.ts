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
})
