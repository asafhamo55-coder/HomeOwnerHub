import { describe, expect, it, vi } from 'vitest'
import { signVendorInsuranceSettings, withVendorInsuranceSettings } from '@homeowner-portal/workflows/vendor-insurance'
import { coiNoticeEntityId } from './milestones'
import * as runModule from './run'
import {
  runVendorCoiReminders,
  runVendorCoiRemindersForAssociation,
  type CoiAssociation,
  type CoiNoticeRow,
  type ExpiringCoi,
  type VendorCoiRemindersDeps,
  type VendorCoiStore,
} from './run'

/**
 * BL-083 runner, board-facing only (owner rule 2026-10-20: nothing goes
 * outside the board automatically). milestone → in-app notice to each
 * board member / admin. In-memory store; clocks pinned; zones explicit.
 */

const ORG = 'org-1'
const ASSOC = 'a0000000-0000-4000-8000-000000000001'
const SECRET = 's3cret'
// 2026-10-18 10:00 EDT
const NOW = new Date('2026-10-18T14:00:00Z')

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
  expiresOn: '2026-10-25', // 7 days out in New York
  ...over,
})

function memoryStore(opts: { rows?: ExpiringCoi[]; board?: string[]; associations?: CoiAssociation[] } = {}) {
  const notices: CoiNoticeRow[] = []
  const windows: Array<[string, string]> = []
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
  }
  return { store, notices, windows }
}

const deps: VendorCoiRemindersDeps = { settingsSecret: () => SECRET }

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

function savedSettings(coiRemindersEnabled: boolean) {
  return withVendorInsuranceSettings(
    { outbound_mode: 'live' },
    signVendorInsuranceSettings(
      ASSOC,
      {
        coiRemindersEnabled,
        minimums: {
          glPerOccurrenceMin: 1_000_000,
          glAggregateMin: null,
          workersCompRequired: true,
          autoLiabilityMin: null,
          umbrellaMin: null,
        },
      },
      { updatedAt: '2026-10-01T00:00:00Z', updatedBy: null },
      SECRET,
    ),
  )
}

describe('the job cannot email anyone (owner rule 2026-10-20)', () => {
  it('its deps carry no sender and its store has no send or claim step', () => {
    const keys: Array<keyof VendorCoiRemindersDeps> = ['settingsSecret']
    expect(Object.keys(deps)).toEqual(keys)
    const store = runModule.supabaseVendorCoiStore({ from: () => ({}) })
    expect(Object.keys(store).sort()).toEqual(
      ['insertNotices', 'loadAssociations', 'loadBoardUserIds', 'loadExistingNotices', 'loadExpiring'].sort(),
    )
  })
})

describe('runVendorCoiRemindersForAssociation', () => {
  it('notifies each board member in-app for the 7-day milestone, pointing at the vendor page', async () => {
    const m = memoryStore()
    const r = await runVendorCoiRemindersForAssociation(m.store, deps, association(), NOW, logger())
    expect(r).toEqual({ due: 1, notices: 2, remindersOff: false })
    expect(m.notices.map((n) => n.userId)).toEqual(['u-board-1', 'u-admin-1'])
    expect(m.notices[0]).toMatchObject({
      title: 'Acme Roofing LLC: insurance expires in 7 days',
      link: '/vendors/v-1',
      entityId: coiNoticeEntityId(ASSOC, 'v-1', '2026-10-25', 'd7'),
    })
    expect(m.notices[0].body).toContain('Nothing has been sent to the vendor')
    expect(m.notices[0].body).toContain('request an updated certificate')
  })

  it('is idempotent: a second run the same day (or a retry) notifies nobody twice', async () => {
    const m = memoryStore()
    await runVendorCoiRemindersForAssociation(m.store, deps, association(), NOW, logger())
    const again = await runVendorCoiRemindersForAssociation(m.store, deps, association(), NOW, logger())
    expect(again).toMatchObject({ due: 1, notices: 0 })
    expect(m.notices).toHaveLength(2)
  })

  it('a later day inside the same window does not repeat the milestone; the next milestone does notify', async () => {
    const m = memoryStore()
    await runVendorCoiRemindersForAssociation(m.store, deps, association(), NOW, logger())
    await runVendorCoiRemindersForAssociation(m.store, deps, association(), new Date('2026-10-20T14:00:00Z'), logger())
    expect(m.notices).toHaveLength(2)
    await runVendorCoiRemindersForAssociation(m.store, deps, association(), new Date('2026-10-25T14:00:00Z'), logger())
    expect(m.notices).toHaveLength(4)
    expect(m.notices[2].title).toBe('Acme Roofing LLC: insurance expires today')
  })

  it('uses the association’s own day: Los Angeles is still at the 30-day mark when New York reaches 7', async () => {
    const early = new Date('2026-10-18T05:30:00Z') // 01:30 ET, 22:30 PT the day before
    const ny = memoryStore()
    const la = memoryStore()
    await runVendorCoiRemindersForAssociation(ny.store, deps, association(), early, logger())
    await runVendorCoiRemindersForAssociation(la.store, deps, association({ timeZone: 'America/Los_Angeles' }), early, logger())
    expect(ny.notices[0].title).toMatch(/in 7 days$/)
    expect(la.notices[0].title).toMatch(/in 8 days$/)
    expect(la.notices[0].entityId).toBe(coiNoticeEntityId(ASSOC, 'v-1', '2026-10-25', 'd30'))
    expect(la.windows[0]).toEqual(['2026-10-10', '2026-11-16'])
    expect(ny.windows[0]).toEqual(['2026-10-11', '2026-11-17'])
  })

  it('opt-out: with board reminders off, nothing is read and nobody is notified', async () => {
    const m = memoryStore()
    const r = await runVendorCoiRemindersForAssociation(
      m.store,
      deps,
      association({ complianceSettings: savedSettings(false) }),
      NOW,
      logger(),
    )
    expect(r).toEqual({ due: 0, notices: 0, remindersOff: true })
    expect(m.windows).toHaveLength(0)
    expect(m.notices).toHaveLength(0)
  })

  it('on by default, and a forged opt-out (unsigned) is ignored', async () => {
    const forged = { vendor_insurance: { coi_reminders_enabled: false, sig: 'nope' } }
    const m = memoryStore()
    const r = await runVendorCoiRemindersForAssociation(m.store, deps, association({ complianceSettings: forged }), NOW, logger())
    expect(r.remindersOff).toBe(false)
    expect(m.notices).toHaveLength(2)
  })

  it('a signed opt-in is honoured', async () => {
    const m = memoryStore()
    const r = await runVendorCoiRemindersForAssociation(
      m.store,
      deps,
      association({ complianceSettings: savedSettings(true) }),
      NOW,
      logger(),
    )
    expect(r).toMatchObject({ remindersOff: false, notices: 2 })
  })

  it('no board members: counts the due certificate, writes nothing', async () => {
    const m = memoryStore({ board: [] })
    const r = await runVendorCoiRemindersForAssociation(m.store, deps, association(), NOW, logger())
    expect(r).toMatchObject({ due: 1, notices: 0 })
  })

  it('nothing in range: no notice', async () => {
    const m = memoryStore({ rows: [coi({ expiresOn: '2027-01-01' })] })
    const r = await runVendorCoiRemindersForAssociation(m.store, deps, association(), NOW, logger())
    expect(r).toMatchObject({ due: 0, notices: 0 })
    expect(m.notices).toHaveLength(0)
  })

  it('logs ids and counts only — never the vendor’s name', async () => {
    const log = logger()
    await runVendorCoiRemindersForAssociation(memoryStore().store, deps, association(), NOW, log)
    const logged = JSON.stringify([...log.info.mock.calls, ...log.warn.mock.calls, ...log.error.mock.calls])
    expect(logged).not.toContain('Acme')
    expect(logged).not.toContain('Maple Court')
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
    const s = await runVendorCoiReminders(m.store, deps, NOW, log, async (id, fn) => {
      steps.push(id)
      return fn()
    })
    expect(steps).toEqual(['bad', ASSOC])
    expect(s).toEqual({ associations: 2, due: 1, notices: 2 })
    expect(log.error).toHaveBeenCalledTimes(1)
  })
})
