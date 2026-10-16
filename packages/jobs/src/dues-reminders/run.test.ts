import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  OUTBOUND_BLOCKED_ERROR,
  guardRecipients,
} from '@homeowner-portal/observability/outbound-guard'
import { signDuesReminderSettings, withDuesReminderSettings } from './config'
import type { PlanAssessment, PlanOwnership } from './plan'
import {
  runDuesReminders,
  runDuesRemindersForAssociation,
  type DuesReminderStore,
  type DuesRemindersDeps,
  type ReminderEmail,
  type StoredAssociation,
} from './run'
import { reminderCommunicationId } from './schedule'

/**
 * The runner: claim → recipients → guarded send → outcome, per
 * (assessment, step). An in-memory store stands in for Supabase; the
 * guard is the REAL outbound-guard module.
 */

const ORG = 'org-1'
const ASSOC = 'a0000000-0000-4000-8000-000000000001'
const SECRET = 's3cret'
// 2026-10-06 10:00 EDT — +5 for a 2026-10-01 due date.
const NOW = new Date('2026-10-06T14:00:00Z')
const RESIDENT = 'owner@gmail.com'
const ALLOWED = 'treasurer@example.test'

afterEach(() => {
  vi.unstubAllEnvs()
})

interface Comm {
  id: string
  status: string
  relatedResource: Record<string, unknown>
  source: string
}
interface Rcpt {
  id: string
  communicationId: string
  email: string
  status: string
  error: string | null
}

function memoryStore(opts: {
  assessments?: PlanAssessment[]
  ownerships?: PlanOwnership[]
  activePlans?: string[]
  attorney?: string[]
  sandbox?: boolean
  associations?: StoredAssociation[]
}) {
  const comms = new Map<string, Comm>()
  const recipients: Rcpt[] = []
  let seq = 0
  const store: DuesReminderStore = {
    loadAssociations: async () => opts.associations ?? [],
    loadOpenAssessments: async () => opts.assessments ?? [],
    loadActivePlanUnitIds: async () => new Set(opts.activePlans ?? []),
    loadAttorneyStageUnitIds: async () => new Set(opts.attorney ?? []),
    loadOwnerships: async (unitIds) => (opts.ownerships ?? []).filter((o) => unitIds.includes(o.unitId)),
    loadExistingCommunicationIds: async (ids) => new Set(ids.filter((id) => comms.has(id))),
    orgSandbox: async () => opts.sandbox ?? false,
    claim: async (c) => {
      if (comms.has(c.id)) return { ok: false, reason: 'exists' }
      comms.set(c.id, { id: c.id, status: 'sending', relatedResource: c.relatedResource, source: 'cron' })
      return { ok: true }
    },
    insertRecipients: async (communicationId, _org, _unit, rs) =>
      rs.map((r) => {
        const row = { id: `r${++seq}`, communicationId, email: r.email, status: 'queued', error: null }
        recipients.push(row)
        return { id: row.id, email: r.email, name: r.name }
      }),
    markRecipient: async (id, outcome) => {
      const row = recipients.find((r) => r.id === id)!
      row.status = outcome.status
      row.error = outcome.error ?? null
    },
    finish: async (id, status) => {
      comms.get(id)!.status = status
    },
  }
  return { store, comms, recipients }
}

function assessment(over: Partial<PlanAssessment> = {}): PlanAssessment {
  return {
    id: 'as-1',
    unitId: 'u-1',
    unitLabel: '14 Oak St',
    dueDate: '2026-10-01',
    amount: 325,
    paid: 0,
    assessmentType: 'regular',
    ...over,
  }
}

const OWNER: PlanOwnership = { unitId: 'u-1', ownerName: 'Pat', ownerEmail: RESIDENT, ownerUserId: null }

function render(): DuesRemindersDeps['render'] {
  return (input) => ({
    subject: `${input.associationName} dues`,
    html: `<p>Hi ${input.ownerName}</p>`,
    text: `Hi ${input.ownerName}`,
  })
}

function deps(sendEmail?: DuesRemindersDeps['sendEmail']) {
  const send = vi.fn<DuesRemindersDeps['sendEmail']>(
    sendEmail ?? (async () => ({ ok: true as const, messageId: 'msg-1' })),
  )
  return {
    sendEmail: send,
    render: render(),
    appUrl: (p: string) => `https://app.test${p}`,
    settingsSecret: () => SECRET,
    emailConfigured: () => true,
  } satisfies DuesRemindersDeps
}

function logger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

const CTX = {
  associationId: ASSOC,
  organizationId: ORG,
  associationName: 'Maple Creek HOA',
  settings: { enabled: true, offsets: [-3, 5, 15], note: null },
  today: '2026-10-06',
}

/** Mirrors apps/hoa's sendEmail: every recipient passes the real guard
 *  first; only what it allows reaches the transport. */
function guardedSender(transport: (e: ReminderEmail) => void): DuesRemindersDeps['sendEmail'] {
  return async (input, opts) => {
    const guard = guardRecipients('email', [input], (i) => i.to, { ...opts, logger: { warn: () => {} } })
    if (guard.allowed.length === 0) return { ok: false, error: OUTBOUND_BLOCKED_ERROR }
    transport(input)
    return { ok: true, messageId: 'msg-1' }
  }
}

describe('runDuesRemindersForAssociation', () => {
  it('claims a communications row keyed by (assessment, step), sends, and logs the recipient', async () => {
    const { store, comms, recipients } = memoryStore({ assessments: [assessment()], ownerships: [OWNER] })
    const d = deps()

    const result = await runDuesRemindersForAssociation(store, d, CTX, logger())

    expect(result).toMatchObject({ planned: 1, sent: 1, failed: 0, suppressed: 0 })
    const id = reminderCommunicationId('as-1', 5)
    expect(comms.get(id)).toMatchObject({ status: 'sent', source: 'cron' })
    expect(comms.get(id)!.relatedResource).toMatchObject({
      type: 'dues_reminder',
      id: 'as-1',
      step: 5,
      auto: true,
    })
    expect(recipients).toEqual([
      expect.objectContaining({ communicationId: id, email: RESIDENT, status: 'sent' }),
    ])
    expect(d.sendEmail).toHaveBeenCalledTimes(1)
    expect(d.sendEmail.mock.calls[0][0]).toMatchObject({ to: RESIDENT, senderName: 'Maple Creek HOA' })
    expect(d.sendEmail.mock.calls[0][1]).toEqual({ orgSandbox: false, ref: id })
  })

  it('is idempotent: a second run the same day sends nothing', async () => {
    const { store } = memoryStore({ assessments: [assessment()], ownerships: [OWNER] })
    const d = deps()
    await runDuesRemindersForAssociation(store, d, CTX, logger())
    const second = await runDuesRemindersForAssociation(store, d, CTX, logger())
    expect(second).toMatchObject({ planned: 0, sent: 0 })
    expect(second.skipped.alreadySent).toBe(1)
    expect(d.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('sends nothing when the claim loses a race (row inserted between plan and claim)', async () => {
    const { store } = memoryStore({ assessments: [assessment()], ownerships: [OWNER] })
    const realClaim = store.claim
    store.claim = async () => ({ ok: false, reason: 'exists' })
    const d = deps()
    const result = await runDuesRemindersForAssociation(store, d, CTX, logger())
    expect(result.sent).toBe(0)
    expect(result.skipped.alreadySent).toBe(1)
    expect(d.sendEmail).not.toHaveBeenCalled()
    store.claim = realClaim
  })

  it('skips payment-plan and attorney-stage units without claiming anything', async () => {
    const { store, comms } = memoryStore({
      assessments: [assessment(), assessment({ id: 'as-2', unitId: 'u-2' })],
      ownerships: [OWNER, { ...OWNER, unitId: 'u-2' }],
      activePlans: ['u-1'],
      attorney: ['u-2'],
    })
    const d = deps()
    const result = await runDuesRemindersForAssociation(store, d, CTX, logger())
    expect(result.skipped).toMatchObject({ paymentPlan: 1, attorney: 1 })
    expect(comms.size).toBe(0)
    expect(d.sendEmail).not.toHaveBeenCalled()
  })

  it('does not claim when email delivery is not configured (would be a fake "sent")', async () => {
    const { store, comms } = memoryStore({ assessments: [assessment()], ownerships: [OWNER] })
    const d = { ...deps(), emailConfigured: () => false }
    const result = await runDuesRemindersForAssociation(store, d, CTX, logger())
    expect(result.sent).toBe(0)
    expect(comms.size).toBe(0)
  })

  it('marks a failed provider send failed and the communication failed', async () => {
    const { store, comms, recipients } = memoryStore({ assessments: [assessment()], ownerships: [OWNER] })
    const d = deps(async () => ({ ok: false as const, error: 'Resend down' }))
    const result = await runDuesRemindersForAssociation(store, d, CTX, logger())
    expect(result).toMatchObject({ sent: 0, failed: 1 })
    expect(recipients[0].status).toBe('failed')
    expect(comms.get(reminderCommunicationId('as-1', 5))!.status).toBe('failed')
  })

  it('never puts an address or name in a log line', async () => {
    const { store } = memoryStore({ assessments: [assessment()], ownerships: [OWNER] })
    const log = logger()
    await runDuesRemindersForAssociation(store, deps(), CTX, log)
    const all = JSON.stringify([...log.info.mock.calls, ...log.warn.mock.calls, ...log.error.mock.calls])
    expect(all).not.toContain(RESIDENT)
    expect(all).not.toContain('Pat')
    expect(all).not.toContain('14 Oak St')
  })
})

describe('outbound guard (BL-004) — a sandbox org reaches nobody off the allowlist', () => {
  it('in production, a sandbox org sends NOTHING to a non-allowlisted address', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('OUTBOUND_ALLOWLIST', ALLOWED)
    const transport = vi.fn()
    const { store, recipients } = memoryStore({
      assessments: [assessment()],
      ownerships: [OWNER],
      sandbox: true,
    })
    const d = deps(guardedSender(transport))

    const result = await runDuesRemindersForAssociation(store, d, CTX, logger())

    expect(transport).not.toHaveBeenCalled()
    expect(d.sendEmail.mock.calls[0][1]).toMatchObject({ orgSandbox: true })
    expect(result).toMatchObject({ sent: 0, suppressed: 1 })
    expect(recipients[0]).toMatchObject({ status: 'suppressed', error: OUTBOUND_BLOCKED_ERROR })
  })

  it('in production, the same sandbox org still reaches an allowlisted address', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('OUTBOUND_ALLOWLIST', ALLOWED)
    const transport = vi.fn()
    const { store } = memoryStore({
      assessments: [assessment()],
      ownerships: [{ ...OWNER, ownerEmail: ALLOWED }],
      sandbox: true,
    })
    const result = await runDuesRemindersForAssociation(store, deps(guardedSender(transport)), CTX, logger())
    expect(transport).toHaveBeenCalledTimes(1)
    expect(result.sent).toBe(1)
  })

  it('outside production, nothing reaches a non-allowlisted address even for a normal org', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('OUTBOUND_ALLOWLIST', '')
    const transport = vi.fn()
    const { store } = memoryStore({ assessments: [assessment()], ownerships: [OWNER], sandbox: false })
    const result = await runDuesRemindersForAssociation(store, deps(guardedSender(transport)), CTX, logger())
    expect(transport).not.toHaveBeenCalled()
    expect(result.suppressed).toBe(1)
  })
})

describe('runDuesReminders — which associations run', () => {
  const value = { enabled: true, offsets: [-3, 5, 15], note: null }
  const approval = { approvedAt: '2026-10-01T00:00:00Z', approvedBy: 'u-board' }

  function assoc(id: string, cs: unknown): StoredAssociation {
    return { id, name: `Assoc ${id}`, organizationId: ORG, complianceSettings: cs }
  }

  it('runs only associations whose signed config is enabled', async () => {
    const on = 'a0000000-0000-4000-8000-0000000000aa'
    const off = 'a0000000-0000-4000-8000-0000000000bb'
    const tampered = 'a0000000-0000-4000-8000-0000000000cc'
    const unset = 'a0000000-0000-4000-8000-0000000000dd'
    const tamperedStored = signDuesReminderSettings(tampered, { ...value, enabled: false }, approval, SECRET)
    const { store } = memoryStore({
      associations: [
        assoc(on, withDuesReminderSettings({}, signDuesReminderSettings(on, value, approval, SECRET))),
        assoc(off, withDuesReminderSettings({}, signDuesReminderSettings(off, { ...value, enabled: false }, approval, SECRET))),
        assoc(tampered, withDuesReminderSettings({}, { ...tamperedStored, enabled: true })),
        assoc(unset, {}),
      ],
      assessments: [assessment()],
      ownerships: [OWNER],
    })
    const seen: string[] = []
    const d = deps()
    const summary = await runDuesReminders(store, d, NOW, logger(), async (assocId, fn) => {
      seen.push(assocId)
      return fn()
    })
    expect(seen).toEqual([on])
    expect(summary).toMatchObject({ associations: 4, enabled: 1, sent: 1 })
  })
})
