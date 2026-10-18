import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runVendorCoiRemindersForAssociation, type VendorCoiStore } from '@homeowner-portal/jobs/vendor-coi-reminders'

/**
 * BL-083 × BL-004, end to end in the app: the deps apps/hoa registers the
 * vendor COI job with — the app's REAL sendEmail, Resend mocked — must
 * deliver nothing to a non-allowlisted address for a sandbox org, and
 * carry the recipient row as the Message-ID so a vendor's reply threads.
 */

const send = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    emails = { send }
  },
}))

const VENDOR = 'office@acme-roofing.example'
const ALLOWED = 'treasurer@example.test'
const NOW = new Date('2026-10-18T14:00:00Z')

async function freshDeps() {
  vi.resetModules()
  return (await import('./deps')).vendorCoiReminderDeps
}

function store(sandbox: boolean, email: string) {
  const statuses: string[] = []
  const s: VendorCoiStore = {
    loadAssociations: async () => [],
    loadExpiring: async () => [{ vendorId: 'v-1', vendorName: 'Acme Roofing LLC', vendorEmail: email, expiresOn: '2026-10-25' }],
    loadBoardUserIds: async () => [],
    loadExistingNotices: async () => new Set(),
    insertNotices: async () => {},
    orgSandbox: async () => sandbox,
    claim: async () => ({ ok: true }),
    insertRecipient: async () => ({ id: '0f0f0f0f-0000-4000-8000-000000000001' }),
    markRecipient: async (_id, outcome) => {
      statuses.push(outcome.status)
    },
    finish: async () => {},
  }
  return { s, statuses }
}

const ASSOCIATION = {
  id: 'a0000000-0000-4000-8000-000000000001',
  name: 'Maple Creek HOA',
  organizationId: 'org-1',
  complianceSettings: {},
  timeZone: 'America/New_York',
}
const quiet = { info: () => {}, warn: () => {}, error: () => {} }

describe('vendorCoiReminderDeps — the guarded sender the job is registered with', () => {
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

  it('a sandbox org in production sends nothing to a non-allowlisted vendor', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const deps = await freshDeps()
    const { s, statuses } = store(true, VENDOR)
    const r = await runVendorCoiRemindersForAssociation(s, deps, ASSOCIATION, NOW, quiet)
    expect(send).not.toHaveBeenCalled()
    expect(statuses).toEqual(['suppressed'])
    expect(r).toMatchObject({ emailed: 0, suppressed: 1 })
  })

  it('reaches an allowlisted address as the association, threaded to the recipient row', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const deps = await freshDeps()
    const { s, statuses } = store(true, ALLOWED)
    await runVendorCoiRemindersForAssociation(s, deps, ASSOCIATION, NOW, quiet)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toMatchObject({ to: ALLOWED, from: '"Maple Creek HOA" <noreply@example.test>' })
    expect(send.mock.calls[0][0].headers['Message-ID']).toContain('0f0f0f0f-0000-4000-8000-000000000001')
    expect(statuses).toEqual(['sent'])
  })

  it('reports email as unconfigured without a Resend key, so the job claims nothing', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const deps = await freshDeps()
    expect(deps.emailConfigured()).toBe(false)
  })
})
