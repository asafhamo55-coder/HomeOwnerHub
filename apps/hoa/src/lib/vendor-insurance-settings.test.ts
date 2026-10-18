import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readVendorInsuranceSettings, resolveVendorInsuranceSettings } from '@homeowner-portal/workflows/vendor-insurance'

/**
 * Settings → Vendors actions (BL-083 / BL-084): board/admin only; saving
 * signs the minimums and the reminder opt-out into compliance_settings
 * without disturbing other keys; the read path the compliance check and
 * RFPs use sees exactly what was saved.
 */

const ASSOC = 'a0000000-0000-4000-8000-000000000001'
const SECRET = 'test-secret'

const { mockGate, state } = vi.hoisted(() => ({
  mockGate: vi.fn(),
  state: {
    associations: [] as unknown[],
    updates: [] as Array<{ table: string; patch: Record<string, unknown> }>,
    updateError: null as null | { code: string; message: string },
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
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-board' } } }) },
    from: (table: string) => {
      let patch: Record<string, unknown> | null = null
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'limit']) chain[m] = () => chain
      chain.update = (p: Record<string, unknown>) => {
        patch = p
        return chain
      }
      chain.then = (resolve: (r: unknown) => unknown) => {
        if (patch) {
          if (state.updateError) return Promise.resolve({ data: null, error: state.updateError }).then(resolve)
          state.updates.push({ table, patch })
          return Promise.resolve({ data: [{ id: ASSOC }], error: null }).then(resolve)
        }
        return Promise.resolve({ data: state.associations, error: null }).then(resolve)
      }
      return chain
    },
  }),
}))

import { getBoardVendorInsuranceSettings, saveVendorInsuranceSettings } from './vendor-insurance-settings'

const INPUT = {
  coiRemindersEnabled: false,
  glPerOccurrenceMin: '1,000,000',
  glAggregateMin: '2000000',
  workersCompRequired: true,
  autoLiabilityMin: '',
}

beforeEach(() => {
  vi.stubEnv('PAY_SETTINGS_SECRET', SECRET)
  mockGate.mockResolvedValue({ ok: true, role: 'board', orgId: 'org-1' })
  state.updates = []
  state.updateError = null
  state.associations = [
    {
      id: ASSOC,
      name: 'Demo Court HOA',
      compliance_settings: { outbound_mode: 'sandbox', pay_by_zelle: { recipient: 'x' }, gl_per_occurrence_min: 500_000 },
    },
  ]
})

describe('board gate', () => {
  it('refuses a resident before touching the database', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Only board members and admins can make this change.' })
    expect((await saveVendorInsuranceSettings(INPUT)).ok).toBe(false)
    expect(state.updates).toEqual([])
    expect(await getBoardVendorInsuranceSettings()).toEqual({ ok: false, reason: 'forbidden' })
  })
})

describe('getBoardVendorInsuranceSettings', () => {
  it('shows reminders on and today’s minimums when nothing is saved', async () => {
    const r = await getBoardVendorInsuranceSettings()
    expect(r.ok && r.data.state).toBe('not_configured')
    expect(r.ok && r.data.settings).toEqual({
      coiRemindersEnabled: true,
      minimums: { glPerOccurrenceMin: 500_000, glAggregateMin: null, workersCompRequired: false, autoLiabilityMin: null },
    })
  })

  it('reports no association distinctly from a failure', async () => {
    state.associations = []
    expect(await getBoardVendorInsuranceSettings()).toEqual({ ok: false, reason: 'no_association' })
  })
})

describe('saveVendorInsuranceSettings', () => {
  it('signs the setting into compliance_settings, keeps the other keys, and the read path sees it', async () => {
    expect(await saveVendorInsuranceSettings(INPUT)).toEqual({ ok: true })
    expect(state.updates).toHaveLength(1)
    const cs = state.updates[0].patch.compliance_settings as Record<string, unknown>
    expect(cs.outbound_mode).toBe('sandbox')
    expect(cs.pay_by_zelle).toEqual({ recipient: 'x' })
    expect(cs.gl_per_occurrence_min).toBeUndefined()
    const read = readVendorInsuranceSettings(ASSOC, cs, SECRET)
    expect(read.state === 'configured' && read.updatedBy).toBe('u-board')
    expect(resolveVendorInsuranceSettings(ASSOC, cs, SECRET)).toEqual({
      coiRemindersEnabled: false,
      minimums: { glPerOccurrenceMin: 1_000_000, glAggregateMin: 2_000_000, workersCompRequired: true, autoLiabilityMin: null },
    })
  })

  it('returns field errors and writes nothing for a bad amount', async () => {
    const r = await saveVendorInsuranceSettings({ ...INPUT, autoLiabilityMin: '12.50' })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.fieldErrors?.autoLiabilityMin).toBeTruthy()
    expect(state.updates).toEqual([])
  })

  it('a failed write is a generic error and logs the code only', async () => {
    state.updateError = { code: '42501', message: 'row for jane@example.com' }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await saveVendorInsuranceSettings(INPUT)
    expect(r).toEqual({ ok: false, error: 'Couldn’t save the vendor settings. Try again.' })
    expect(JSON.stringify(spy.mock.calls)).toContain('42501')
    expect(JSON.stringify(spy.mock.calls)).not.toContain('jane@example.com')
    spy.mockRestore()
  })
})
