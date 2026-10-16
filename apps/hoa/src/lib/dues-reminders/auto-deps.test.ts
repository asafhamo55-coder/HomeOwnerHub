import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  runDuesRemindersForAssociation,
  type DuesReminderStore,
  type PlanAssessment,
} from '@homeowner-portal/jobs/dues-reminders'

/**
 * BL-013 × BL-004, end to end in the app: the deps apps/hoa registers the
 * dues-reminder job with — the app's REAL sendEmail, Resend mocked — must
 * deliver nothing to a non-allowlisted address for a sandbox org. If
 * someone swaps the injected sender for a raw Resend call, this fails.
 */

const send = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    emails = { send }
  },
}))

const RESIDENT = 'owner@gmail.com'
const ALLOWED = 'treasurer@example.test'

async function freshDeps() {
  vi.resetModules()
  return (await import('./auto-deps')).duesReminderDeps
}

function store(sandbox: boolean, email: string) {
  const statuses: string[] = []
  const assessment: PlanAssessment = {
    id: 'as-1',
    unitId: 'u-1',
    unitLabel: '14 Oak St',
    dueDate: '2026-10-01',
    amount: 325,
    paid: 0,
    assessmentType: 'regular',
  }
  const s: DuesReminderStore = {
    loadAssociations: async () => [],
    loadOpenAssessments: async () => [assessment],
    loadActivePlanUnitIds: async () => new Set(),
    loadAttorneyStageUnitIds: async () => new Set(),
    loadOwnerships: async () => [{ unitId: 'u-1', ownerName: 'Pat', ownerEmail: email, ownerUserId: null }],
    loadExistingCommunicationIds: async () => new Set(),
    orgSandbox: async () => sandbox,
    claim: async () => ({ ok: true }),
    insertRecipients: async (_c, _o, _u, rs) => rs.map((r, i) => ({ id: `r${i}`, email: r.email, name: r.name })),
    markRecipient: async (_id, outcome) => {
      statuses.push(outcome.status)
    },
    finish: async () => {},
  }
  return { s, statuses }
}

const CTX = {
  associationId: 'a0000000-0000-4000-8000-000000000001',
  organizationId: 'org-1',
  associationName: 'Maple Creek HOA',
  settings: { enabled: true, offsets: [-3, 5, 15], note: null },
  today: '2026-10-06',
}
const quiet = { info: () => {}, warn: () => {}, error: () => {} }

describe('duesReminderDeps — the guarded sender the job is registered with', () => {
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
    const deps = await freshDeps()
    const { s, statuses } = store(true, RESIDENT)

    const result = await runDuesRemindersForAssociation(s, deps, CTX, quiet)

    expect(send).not.toHaveBeenCalled()
    expect(statuses).toEqual(['suppressed'])
    expect(result).toMatchObject({ sent: 0, suppressed: 1 })
  })

  it('outside production nothing reaches a non-allowlisted address', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const deps = await freshDeps()
    const { s } = store(false, RESIDENT)
    await runDuesRemindersForAssociation(s, deps, CTX, quiet)
    expect(send).not.toHaveBeenCalled()
  })

  it('a sandbox org still reaches an allowlisted address (the guard is what decided)', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const deps = await freshDeps()
    const { s, statuses } = store(true, ALLOWED)
    await runDuesRemindersForAssociation(s, deps, CTX, quiet)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toMatchObject({ to: ALLOWED, from: '"Maple Creek HOA" <noreply@example.test>' })
    expect(statuses).toEqual(['sent'])
  })

  it('reports email as unconfigured without a Resend key, so the job claims nothing', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const deps = await freshDeps()
    expect(deps.emailConfigured()).toBe(false)
  })
})
