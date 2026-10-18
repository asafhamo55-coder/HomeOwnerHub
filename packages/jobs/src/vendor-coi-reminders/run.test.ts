import { afterEach, describe, expect, it, vi } from 'vitest'
import { OUTBOUND_BLOCKED_ERROR, guardRecipients } from '@homeowner-portal/observability/outbound-guard'
import { signVendorInsuranceSettings, withVendorInsuranceSettings } from '@homeowner-portal/workflows/vendor-insurance'
import { coiReminderCommunicationId } from './milestones'
import {
  runVendorCoiReminders,
  runVendorCoiRemindersForAssociation,
  type CoiAssociation,
  type CoiNoticeRow,
  type ExpiringCoi,
  type VendorCoiEmail,
  type VendorCoiRemindersDeps,
  type VendorCoiStore,
} from './run'

/**
 * BL-083 runner: milestone → claim → guarded send → board notice, per
 * vendor. In-memory store; the outbound guard is the REAL module. Clocks
 * are pinned; association zones are explicit.
 */

const ORG = 'org-1'
const ASSOC = 'a0000000-0000-4000-8000-000000000001'
const SECRET = 's3cret'
// 2026-10-18 10:00 EDT
const NOW = new Date('2026-10-18T14:00:00Z')
const VENDOR_EMAIL = 'office@acme-roofing.example'

afterEach(() => vi.unstubAllEnvs())

const association = (over: Partial<CoiAssociation> = {}): CoiAssociation => ({
  id: ASSOC,
  name: 'Maple Court HOA',
  organizationId: ORG,
  complianceSettings: {},
  timeZone: 'America/New_York',
  ...over,
})

const coi = (over: Partial<ExpiringCoi> = {}): ExpiringCoi => ({
  vendorId: 'v-1',
  vendorName: 'Acme Roofing LLC',
  vendorEmail: VENDOR_EMAIL,
  expiresOn: '2026-10-25', // 7 days out in New York
  ...over,
})

function memoryStore(opts: { rows?: ExpiringCoi[]; board?: string[]; sandbox?: boolean; associations?: CoiAssociation[] } = {}) {
  const comms = new Map<string, { status: string; relatedResource: Record<string, unknown>; subject: string }>()
  const recipients: Array<{ id: string; communicationId: string; email: string; status: string }> = []
  const notices: CoiNoticeRow[] = []
  const windows: Array<[string, string]> = []
  let seq = 0
  const store: VendorCoiStore = {
    loadAssociations: async () => opts.associations ?? [association()],
    loadExpiring: async (_a, from, through) => {
      windows.push([from, through])
      return opts.rows ?? [coi()]
    },
    loadBoardUserIds: async () => opts.board ?? ['u-board-1', 'u-admin-1'],
    loadExistingNotices: async (ids) =>
      new Set(notices.filter((n) => ids.includes(n.entityId)).map((n) => `${n.userId}:${n.entityId}`)),
    insertNotices: async (rows) => {
      notices.push(...rows)
    },
    orgSandbox: async () => opts.sandbox ?? false,
    claim: async (c) => {
      if (comms.has(c.id)) return { ok: false, reason: 'exists' }
      comms.set(c.id, { status: 'sending', relatedResource: c.relatedResource, subject: c.subject })
      return { ok: true }
    },
    insertRecipient: async (communicationId, _org, r) => {
      const id = `r-${++seq}`
      recipients.push({ id, communicationId, email: r.email, status: 'queued' })
      return { id }
    },
    markRecipient: async (id, outcome) => {
      recipients.find((r) => r.id === id)!.status = outcome.status
    },
    finish: async (id, status) => {
      comms.get(id)!.status = status
    },
  }
  return { store, comms, recipients, notices, windows }
}

function deps(sendEmail?: VendorCoiRemindersDeps['sendEmail'], emailConfigured = true) {
  const send = vi.fn<VendorCoiRemindersDeps['sendEmail']>(sendEmail ?? (async () => ({ ok: true as const, messageId: 'm-1' })))
  return { sendEmail: send, settingsSecret: () => SECRET, emailConfigured: () => emailConfigured }
}

function guardedSender(transport: (i: VendorCoiEmail) => void): VendorCoiRemindersDeps['sendEmail'] {
  return async (input, opts) => {
    const guard = guardRecipients('email', [input], (i) => i.to, { ...opts, logger: { warn: () => {} } })
    if (guard.allowed.length === 0) return { ok: false, error: OUTBOUND_BLOCKED_ERROR }
    transport(input)
    return { ok: true, messageId: 'm-1' }
  }
}

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

function savedSettings(coiRemindersEnabled: boolean) {
  return withVendorInsuranceSettings(
    { outbound_mode: 'live' },
    signVendorInsuranceSettings(
      ASSOC,
      {
        coiRemindersEnabled,
        minimums: { glPerOccurrenceMin: 1_000_000, glAggregateMin: null, workersCompRequired: true, autoLiabilityMin: null },
      },
      { updatedAt: '2026-10-01T00:00:00Z', updatedBy: null },
      SECRET,
    ),
  )
}

describe('runVendorCoiRemindersForAssociation', () => {
  it('emails the vendor once for the 7-day milestone and notifies each board member in-app', async () => {
    const m = memoryStore()
    const d = deps()
    const r = await runVendorCoiRemindersForAssociation(m.store, d, association(), NOW, logger())
    expect(r).toMatchObject({ due: 1, emailed: 1, failed: 0, alreadySent: 0, notices: 2, remindersOff: false })
    expect(d.sendEmail).toHaveBeenCalledTimes(1)
    const [email, opts] = d.sendEmail.mock.calls[0]
    expect(email.to).toBe(VENDOR_EMAIL)
    expect(email.subject).toBe('Your certificate of insurance with Maple Court HOA expires in 7 days')
    expect(email.text).toContain('reply to this email with your renewed certificate')
    expect(email.senderName).toBe('Maple Court HOA')
    expect(email.recipientRef).toBe('r-1')
    const id = coiReminderCommunicationId(ASSOC, 'v-1', '2026-10-25', 'd7')
    expect(opts).toEqual({ orgSandbox: false, ref: id })
    expect(m.comms.get(id)).toMatchObject({ status: 'sent', relatedResource: { type: 'vendor_coi_reminder', milestone: 'd7' } })
    expect(m.notices.map((n) => n.userId)).toEqual(['u-board-1', 'u-admin-1'])
    expect(m.notices[0]).toMatchObject({
      title: 'Acme Roofing LLC: insurance expires in 7 days',
      link: '/vendors/v-1',
    })
    expect(m.notices[0].body).toContain('We emailed the vendor')
  })

  it('is idempotent: a second run the same day (or a retry) sends nothing and adds no notices', async () => {
    const m = memoryStore()
    const d = deps()
    await runVendorCoiRemindersForAssociation(m.store, d, association(), NOW, logger())
    const again = await runVendorCoiRemindersForAssociation(m.store, d, association(), new Date('2026-10-18T20:00:00Z'), logger())
    expect(d.sendEmail).toHaveBeenCalledTimes(1)
    expect(again).toMatchObject({ due: 1, emailed: 0, alreadySent: 1, notices: 0 })
    expect(m.notices).toHaveLength(2)
  })

  it('a later day inside the same window does not repeat the milestone; the next milestone sends once', async () => {
    const m = memoryStore()
    const d = deps()
    await runVendorCoiRemindersForAssociation(m.store, d, association(), NOW, logger()) // 7 days: d7
    await runVendorCoiRemindersForAssociation(m.store, d, association(), new Date('2026-10-20T14:00:00Z'), logger()) // 5 days: d7 again
    expect(d.sendEmail).toHaveBeenCalledTimes(1)
    await runVendorCoiRemindersForAssociation(m.store, d, association(), new Date('2026-10-25T14:00:00Z'), logger()) // expiry day
    expect(d.sendEmail).toHaveBeenCalledTimes(2)
    expect(d.sendEmail.mock.calls[1][0].subject).toBe('Your certificate of insurance with Maple Court HOA expires today')
    expect(m.comms.size).toBe(2)
    expect(m.notices).toHaveLength(4)
  })

  it('uses the association’s own day: Los Angeles is still at the 30-day mark when New York reaches 7', async () => {
    const early = new Date('2026-10-18T05:30:00Z') // 01:30 ET, 22:30 PT the day before
    const ny = memoryStore()
    const la = memoryStore()
    const dNy = deps()
    const dLa = deps()
    await runVendorCoiRemindersForAssociation(ny.store, dNy, association(), early, logger())
    await runVendorCoiRemindersForAssociation(la.store, dLa, association({ timeZone: 'America/Los_Angeles' }), early, logger())
    expect(dNy.sendEmail.mock.calls[0][0].subject).toMatch(/in 7 days$/)
    expect(dLa.sendEmail.mock.calls[0][0].subject).toMatch(/in 8 days$/)
    expect([...la.comms.values()][0].relatedResource.milestone).toBe('d30')
    // The window it asked the store for is around the association's day.
    expect(la.windows[0]).toEqual(['2026-10-10', '2026-11-16'])
    expect(ny.windows[0]).toEqual(['2026-10-11', '2026-11-17'])
  })

  it('opt-out: with reminders off the vendor gets nothing, the board still gets a notice saying so', async () => {
    const m = memoryStore()
    const d = deps()
    const r = await runVendorCoiRemindersForAssociation(
      m.store,
      d,
      association({ complianceSettings: savedSettings(false) }),
      NOW,
      logger(),
    )
    expect(d.sendEmail).not.toHaveBeenCalled()
    expect(m.comms.size).toBe(0)
    expect(r).toMatchObject({ remindersOff: true, emailed: 0, notices: 2 })
    expect(m.notices[0].body).toContain('Vendor reminders are off in Settings → Vendors.')
  })

  it('on by default, and a forged opt-out (unsigned) is ignored', async () => {
    const forged = { vendor_insurance: { coi_reminders_enabled: false, sig: 'nope' } }
    const d = deps()
    await runVendorCoiRemindersForAssociation(memoryStore().store, d, association({ complianceSettings: forged }), NOW, logger())
    expect(d.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('states the board’s insurance minimums in the email', async () => {
    const d = deps()
    await runVendorCoiRemindersForAssociation(memoryStore().store, d, association({ complianceSettings: savedSettings(true) }), NOW, logger())
    const email = d.sendEmail.mock.calls[0][0]
    expect(email.text).toContain('- General liability: $1,000,000 per occurrence')
    expect(email.html).toContain('Workers’ compensation: required')
  })

  it('a vendor without an email is counted, not mailed, and the board is told to call them', async () => {
    const m = memoryStore({ rows: [coi({ vendorEmail: null })] })
    const d = deps()
    const r = await runVendorCoiRemindersForAssociation(m.store, d, association(), NOW, logger())
    expect(d.sendEmail).not.toHaveBeenCalled()
    expect(r.noEmail).toBe(1)
    expect(m.notices[0].body).toContain('No email on file')
  })

  it('claims nothing when email delivery is not configured', async () => {
    const m = memoryStore()
    const d = deps(undefined, false)
    const log = logger()
    await runVendorCoiRemindersForAssociation(m.store, d, association(), NOW, log)
    expect(m.comms.size).toBe(0)
    expect(d.sendEmail).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalled()
  })

  it('sandbox org: the real guard blocks a non-allowlisted vendor and records it as suppressed', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('OUTBOUND_ALLOWLIST', 'treasurer@example.test')
    const transport = vi.fn()
    const m = memoryStore({ sandbox: true })
    const r = await runVendorCoiRemindersForAssociation(m.store, deps(guardedSender(transport)), association(), NOW, logger())
    expect(transport).not.toHaveBeenCalled()
    expect(r.suppressed).toBe(1)
    expect(m.recipients[0].status).toBe('suppressed')
  })

  it('nothing in range: no email, no notice', async () => {
    const m = memoryStore({ rows: [coi({ expiresOn: '2026-12-31' }), coi({ vendorId: 'v-2', expiresOn: '2026-01-01' })] })
    const d = deps()
    const r = await runVendorCoiRemindersForAssociation(m.store, d, association(), NOW, logger())
    expect(r.due).toBe(0)
    expect(d.sendEmail).not.toHaveBeenCalled()
    expect(m.notices).toEqual([])
  })

  it('logs ids and counts only — never the vendor’s address, name or the subject', async () => {
    const log = logger()
    const failing = deps(async () => ({ ok: false as const, error: `rejected ${VENDOR_EMAIL}` }))
    await runVendorCoiRemindersForAssociation(memoryStore().store, failing, association(), NOW, log)
    const logged = JSON.stringify([...log.info.mock.calls, ...log.warn.mock.calls, ...log.error.mock.calls])
    expect(logged).not.toContain(VENDOR_EMAIL)
    expect(logged).not.toContain('Acme')
    expect(logged).not.toContain('certificate of insurance')
    expect(logged).toContain(ASSOC)
  })
})

describe('runVendorCoiReminders', () => {
  it('runs each association in its own step and keeps going after one fails', async () => {
    const m = memoryStore({ associations: [association({ id: 'bad' }), association()] })
    const original = m.store.loadExpiring
    m.store.loadExpiring = async (a, f, t) => {
      if (a === 'bad') throw new Error('vendor-coi-reminders: failed to load vendor compliance (57014)')
      return original(a, f, t)
    }
    const steps: string[] = []
    const log = logger()
    const s = await runVendorCoiReminders(m.store, deps(), NOW, log, async (id, fn) => {
      steps.push(id)
      return fn()
    })
    expect(steps).toEqual(['bad', ASSOC])
    expect(s).toMatchObject({ associations: 2, due: 1, emailed: 1, notices: 2 })
    expect(log.error).toHaveBeenCalledTimes(1)
  })
})
