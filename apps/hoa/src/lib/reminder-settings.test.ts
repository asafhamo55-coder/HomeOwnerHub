import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readDuesReminderSettings } from '@homeowner-portal/jobs/dues-reminders'

/**
 * /settings/reminders actions (BL-013): board/admin only, saving signs the
 * config into compliance_settings without disturbing other keys, and the
 * dry run returns counts and unit ids — never names, emails or addresses.
 */

const ASSOC = 'a0000000-0000-4000-8000-000000000001'
const SECRET = 'test-secret'

const { mockGate, mockRevalidate, state } = vi.hoisted(() => ({
  mockGate: vi.fn(),
  mockRevalidate: vi.fn(),
  state: {
    tables: {} as Record<string, unknown[]>,
    updates: [] as Array<{ table: string; patch: Record<string, unknown> }>,
  },
}))

vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: mockGate,
}))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: async () => ({ id: 'org-1', name: 'Demo' }) }))
vi.mock('@/lib/load-or-fail', () => ({
  loadOrFail: async (_what: string, q: PromiseLike<{ data: unknown; error: unknown }>) => {
    const r = await q
    return r.error ? { ok: false } : { ok: true, data: r.data }
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidate }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-board' } } }) },
    from: (table: string) => {
      let patch: Record<string, unknown> | null = null
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit', 'neq']) chain[m] = () => chain
      // Reads page to the end (BL-047); each fixture is one page.
      let from = 0
      chain.range = (f: number) => {
        from = f
        return chain
      }
      chain.update = (p: Record<string, unknown>) => {
        patch = p
        return chain
      }
      chain.then = (resolve: (r: unknown) => unknown) => {
        if (patch) {
          state.updates.push({ table, patch })
          return Promise.resolve({ data: [{ id: ASSOC }], error: null }).then(resolve)
        }
        return Promise.resolve({ data: from > 0 ? [] : (state.tables[table] ?? []), error: null }).then(resolve)
      }
      return chain
    },
  }),
}))

import { getBoardReminderSettings, previewReminderRun, saveReminderSettings } from './reminder-settings'

beforeEach(() => {
  vi.stubEnv('PAY_SETTINGS_SECRET', SECRET)
  mockGate.mockResolvedValue({ ok: true, role: 'board', orgId: 'org-1' })
  state.updates = []
  state.tables = {
    associations: [
      {
        id: ASSOC,
        name: 'Demo Court HOA',
        organization_id: 'org-1',
        compliance_settings: { outbound_mode: 'sandbox', pay_by_zelle: { recipient: 'x' } },
      },
    ],
  }
})

describe('board gate', () => {
  it('refuses a resident before touching the database', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Only board members and admins can make this change.' })
    const r = await saveReminderSettings({ enabled: true, offsets: [-3, 5, 15], note: '' })
    expect(r.ok).toBe(false)
    expect(state.updates).toEqual([])
    expect((await previewReminderRun({ offsets: [5] })).ok).toBe(false)
    expect(await getBoardReminderSettings()).toEqual({ ok: false, reason: 'forbidden' })
  })
})

describe('getBoardReminderSettings', () => {
  it('is OFF with the default cadence when nothing is saved', async () => {
    const r = await getBoardReminderSettings()
    expect(r.ok && r.data.settings).toEqual({ enabled: false, offsets: [-3, 5, 15], note: null })
    expect(r.ok && r.data.state).toBe('not_configured')
  })
})

describe('saveReminderSettings', () => {
  it('signs the config into compliance_settings and keeps the other keys', async () => {
    const r = await saveReminderSettings({ enabled: true, offsets: [15, -3, 5], note: ' Thanks ' })
    expect(r).toEqual({ ok: true })
    expect(state.updates).toHaveLength(1)
    const cs = state.updates[0].patch.compliance_settings as Record<string, unknown>
    expect(cs.outbound_mode).toBe('sandbox')
    expect(cs.pay_by_zelle).toEqual({ recipient: 'x' })
    const read = readDuesReminderSettings(ASSOC, cs, SECRET)
    expect(read.state).toBe('configured')
    expect(read.state === 'configured' && read.settings).toMatchObject({
      enabled: true,
      offsets: [-3, 5, 15],
      note: 'Thanks',
      approvedBy: 'u-board',
    })
  })

  it('returns field errors and writes nothing for bad offsets', async () => {
    const r = await saveReminderSettings({ enabled: true, offsets: [], note: '' })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.fieldErrors?.offsets).toBeTruthy()
    expect(state.updates).toEqual([])
  })
})

describe('previewReminderRun — counts and unit ids only', () => {
  it('lists the unit and recipient count for the next run, with no PII', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z')) // 8am EDT → next run today
    state.tables.assessments = [
      {
        id: 'as-1',
        unit_id: 'u-1',
        amount: 325,
        due_date: '2026-10-01',
        assessment_type: 'regular',
        payments: [],
        unit: { address_line1: '14 Oak St', unit_number: null },
      },
    ]
    state.tables.ownerships = [
      { unit_id: 'u-1', owner_name: 'Pat Doe', owner_email: 'pat@gmail.com', owner_user_id: null },
      { unit_id: 'u-1', owner_name: 'Sam Doe', owner_email: 'sam@gmail.com', owner_user_id: null },
    ]
    try {
      const r = await previewReminderRun({ offsets: [-3, 5, 15] })
      expect(r).toEqual({
        ok: true,
        runDate: '2026-10-06',
        sends: [{ unitId: 'u-1', step: 5, recipientCount: 2 }],
        recipientTotal: 2,
        skipped: { paymentPlan: 0, attorney: 0, alreadySent: 0, noRecipient: 0 },
      })
      const json = JSON.stringify(r)
      for (const pii of ['Pat', 'Sam', 'gmail', 'Oak']) expect(json).not.toContain(pii)
      expect(state.updates).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })
})
