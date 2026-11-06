import { describe, expect, it, vi } from 'vitest'

// The transport is mocked; the guard is the real one. A sandboxed org outside
// production must reach nobody, so nothing here can send a real email.
const batchSend = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    batch = { send: batchSend }
    emails = { send: vi.fn() }
  },
}))

describe('poll email deps', () => {
  it('use the app’s guarded batch sender, not a raw transport', async () => {
    vi.resetModules()
    const email = await import('@/lib/email')
    const { pollEmailDeps } = await import('./notify')
    expect(pollEmailDeps.sendEmailBatch).toBe(email.sendEmailBatch)
    expect(pollEmailDeps.portalUrl).toBe(email.appUrl)
  })

  it('a sandboxed org reaches nobody: the guard holds every poll email and Resend is never called', async () => {
    vi.resetModules()
    batchSend.mockReset()
    vi.stubEnv('EMAIL_FROM', 'HomeownerHub <noreply@homeownerledger.com>')
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('VERCEL_ENV', 'production')
    try {
      const { pollEmailDeps } = await import('./notify')
      const { runPollEmail } = await import('./run')
      const statuses: string[] = []
      const store = {
        loadContext: async () => ({
          association: { id: 'a', name: 'Maple Court', type: 'hoa', organizationId: 'o', timeZone: 'America/New_York' },
          poll: { id: 'p', associationId: 'a', title: 'T?', description: null, allowMultiple: false, resultsVisibility: 'after_close' as const, status: 'open' as const, closesAt: null },
          options: ['Yes', 'No'],
        }),
        loadTally: async () => [],
        loadRecipients: async () => ({
          recipients: [{ unitId: 'u1', userId: null, name: null, email: 'resident@not-on-allowlist.test' }],
          optedOut: 0,
        }),
        communicationStatus: async () => null,
        orgSandbox: async () => true,
        claim: async () => ({ ok: true as const }),
        insertRecipients: async (_c: string, _o: string, rows: Array<{ email: string }>) => rows.map((r, i) => ({ id: `r${i}`, email: r.email })),
        markRecipient: async (_id: string, o: { status: string }) => {
          statuses.push(o.status)
        },
        finish: async () => {},
      }
      const res = await runPollEmail(store, pollEmailDeps, { kind: 'opened', trigger: 'board', pollId: 'p', associationId: 'a' }, { info() {}, warn() {}, error() {} })
      expect(res.status).toBe('held')
      expect(statuses).toEqual(['suppressed'])
      expect(batchSend).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
