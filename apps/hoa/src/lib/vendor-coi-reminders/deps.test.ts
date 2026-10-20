import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runVendorCoiRemindersForAssociation, type VendorCoiStore } from '@homeowner-portal/jobs/vendor-coi-reminders'

/**
 * BL-083 × owner rule 2026-10-20: the deps apps/hoa registers the vendor
 * COI job with carry no sender, and a full run with Resend mocked and
 * configured delivers nothing to anyone — only board notices are written.
 */

const send = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    emails = { send }
  },
}))

const NOW = new Date('2026-10-18T14:00:00Z')

async function freshDeps() {
  vi.resetModules()
  return (await import('./deps')).vendorCoiReminderDeps
}

const ASSOCIATION = {
  id: 'a0000000-0000-4000-8000-000000000001',
  name: 'Maple Creek HOA',
  organizationId: 'org-1',
  complianceSettings: {},
  timeZone: 'America/New_York',
}
const quiet = { info: () => {}, warn: () => {}, error: () => {} }

describe('vendorCoiReminderDeps — board-only, no sender', () => {
  beforeEach(() => {
    send.mockReset()
    send.mockResolvedValue({ data: { id: 'msg_1' }, error: null })
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('EMAIL_FROM', 'HomeownerHub <noreply@example.test>')
    vi.stubEnv('VERCEL_ENV', 'production')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('exposes only the settings secret', async () => {
    const deps = await freshDeps()
    expect(Object.keys(deps)).toEqual(['settingsSecret'])
  })

  it('a run with an expiring certificate writes board notices and emails nobody', async () => {
    const deps = await freshDeps()
    const notices: unknown[] = []
    const store: VendorCoiStore = {
      loadAssociations: async () => [],
      loadExpiring: async () => [{ vendorId: 'v-1', vendorName: 'Acme Roofing LLC', expiresOn: '2026-10-25' }],
      loadBoardUserIds: async () => ['u-board'],
      loadExistingNotices: async () => new Set(),
      insertNotices: async (rows) => {
        notices.push(...rows)
      },
    }
    const r = await runVendorCoiRemindersForAssociation(store, deps, ASSOCIATION, NOW, quiet)
    expect(r).toMatchObject({ due: 1, notices: 1 })
    expect(notices).toHaveLength(1)
    expect(send).not.toHaveBeenCalled()
  })
})
