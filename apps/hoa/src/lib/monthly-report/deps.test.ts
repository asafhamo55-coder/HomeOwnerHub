import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runMonthlyReportForOrg, type MonthlyReportStore } from '@homeowner-portal/jobs/monthly-board-report'

/**
 * BL-073 × BL-004, end to end in the app: the deps apps/hoa registers the
 * month-end report job with — the app's REAL sendEmail, Resend mocked —
 * must deliver nothing to a non-allowlisted address for a sandbox org. If
 * someone swaps the injected sender for a raw Resend call, this fails.
 */

const send = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    emails = { send }
  },
}))

const BLOCKED = 'chair@gmail.com'
const ALLOWED = 'treasurer@example.test'

async function freshDeps() {
  vi.resetModules()
  const { monthlyReportDeps } = await import('./deps')
  // The report itself is covered by render/load tests; here only the sender matters.
  return { ...monthlyReportDeps, buildReport: async () => ({ subject: 'Report', html: '<p>r</p>', text: 'r' }) }
}

function store(sandbox: boolean, email: string) {
  const statuses: string[] = []
  const s: MonthlyReportStore = {
    loadOrgs: async () => [],
    loadOrg: async () => null,
    primaryAssociation: async () => ({ id: 'assoc-1', name: 'Maple Creek', timeZone: 'America/New_York' }),
    boardRecipients: async () => [{ userId: 'u-1', email }],
    userMetadata: async () => new Map(),
    communicationExists: async () => false,
    orgSandbox: async () => sandbox,
    claim: async () => ({ ok: true }),
    insertRecipients: async (_c, _o, rs) => rs.map((r, i) => ({ id: `r${i}`, email: r.email })),
    markRecipient: async (_id, outcome) => {
      statuses.push(outcome.status)
    },
    finish: async () => {},
  }
  return { s, statuses }
}

const CTX = { org: { id: 'org-1', name: 'Maple Creek HOA' }, month: null, now: new Date('2026-10-01T12:00:00Z'), source: 'cron' as const }
const quiet = { info: () => {}, warn: () => {}, error: () => {} }

describe('monthlyReportDeps — the guarded sender the job is registered with', () => {
  beforeEach(() => {
    send.mockReset()
    send.mockResolvedValue({ data: { id: 'msg_1' }, error: null })
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('EMAIL_FROM', 'HomeownerHub <noreply@example.test>')
    vi.stubEnv('OUTBOUND_ALLOWLIST', ALLOWED)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('a sandbox org in production sends nothing to a non-allowlisted address', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const { s, statuses } = store(true, BLOCKED)
    const res = await runMonthlyReportForOrg(s, await freshDeps(), CTX, quiet)
    expect(send).not.toHaveBeenCalled()
    expect(statuses).toEqual(['suppressed'])
    expect(res).toMatchObject({ sent: 0, suppressed: 1 })
  })

  it('outside production nothing reaches a non-allowlisted address', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const { s } = store(false, BLOCKED)
    await runMonthlyReportForOrg(s, await freshDeps(), CTX, quiet)
    expect(send).not.toHaveBeenCalled()
  })

  it('an allowlisted address is sent to (the guard is what decided)', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const { s, statuses } = store(true, ALLOWED)
    await runMonthlyReportForOrg(s, await freshDeps(), CTX, quiet)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toMatchObject({ to: ALLOWED, subject: 'Report' })
    expect(statuses).toEqual(['sent'])
  })

  it('reports email as unconfigured without a Resend key', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    expect((await freshDeps()).emailConfigured()).toBe(false)
  })
})
