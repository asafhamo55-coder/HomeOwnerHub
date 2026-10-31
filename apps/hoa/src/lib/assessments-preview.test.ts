import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memorySupabase } from '@/lib/test-utils/memory-supabase'

const h = vi.hoisted(() => ({ client: null as unknown }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  requireBoardOrAdminForAction: async () => ({ ok: true, role: 'board', orgId: 'org-1' }),
}))
vi.mock('@/lib/vendors', () => ({
  getPrimaryAssociation: async () => ({ id: 'assoc-1', name: 'Oak', timeZone: 'America/New_York' }),
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => h.client }))
vi.mock('@homeowner-portal/jobs/fiscal-periods', () => ({
  readCurrentOpenPeriod: async () => ({ data: { id: 'per-1', start_date: '2026-11-01' } }),
}))
vi.mock('@homeowner-portal/db', () => ({
  loadAccountingRefs: async () => ({ acctAR: 'a', acctAssessmentIncome: 'b', fundOperating: 'f' }),
  postJournalEntry: async () => ({ ok: true }),
}))
vi.mock('@homeowner-portal/workflows', () => ({ memoCodeFor: () => 'memo' }))
vi.mock('@/lib/dues-rates/queries', () => ({ loadDuesRates: async () => [] }))
vi.mock('@/lib/dues-rates/billing', () => ({ recordDuesRateOverride: async () => 'off' }))

import { materializeCurrentPeriodAssessments, previewMaterialize } from './assessments'
import { materializeDueDate, planMaterialize } from './materialize-plan'
import { billedToast, emptyReason, initialAmount, NO_RATE_HINT, PREVIEW_FAILED, previewLine, skippedLine } from './materialize-copy'

function seed() {
  const m = memorySupabase({
    associations: [{ id: 'assoc-1', organization_id: 'org-1', slug: 'oak' }],
    units: [
      { id: 'u1', organization_id: 'org-1', association_id: 'assoc-1', unit_number: '1', legacy_hoa_property_id: 'p1' },
      { id: 'u2', organization_id: 'org-1', association_id: 'assoc-1', unit_number: '2', legacy_hoa_property_id: 'p2' },
      { id: 'u3', organization_id: 'org-1', association_id: 'assoc-1', unit_number: '3', legacy_hoa_property_id: 'p3' },
    ],
    hoa_properties: [
      { id: 'p1', org_id: 'org-1', deleted_at: null },
      { id: 'p2', org_id: 'org-1', deleted_at: null },
      { id: 'p3', org_id: 'org-1', deleted_at: null },
    ],
    assessments: [
      { id: 'x', association_id: 'assoc-1', fiscal_period_id: 'per-1', assessment_type: 'regular', unit_id: 'u1' },
    ],
  })
  h.client = m.client
}

beforeEach(seed)

describe('previewMaterialize', () => {
  it('counts what materialize would create and skips homes already billed', async () => {
    const p = await previewMaterialize()
    expect(p).toMatchObject({ ok: true, toBill: 2, alreadyBilled: 1, rateCents: null, totalCents: null, dueDate: '2026-11-15' })
    const run = await materializeCurrentPeriodAssessments({ amountPerUnit: 100 })
    expect(run).toEqual({ ok: true, created: 2 })
  })
})

describe('shared helpers', () => {
  it('due date is the 15th of the period start month, used by both paths', () => {
    expect(materializeDueDate('2026-11-01')).toBe('2026-11-15')
    const src = readFileSync(join(__dirname, 'assessments.ts'), 'utf8')
    expect(src.match(/materializeDueDate\(period\.start_date\)/g)).toHaveLength(2)
  })
  it('planMaterialize skips billed ids', () => {
    expect(planMaterialize([{ id: 'a' }, { id: 'b' }], ['a', null])).toEqual({ toBill: [{ id: 'b' }], alreadyBilled: 1 })
  })
})

describe('dialog copy', () => {
  const facts = { toBill: 12, alreadyBilled: 3, rateCents: 25000, totalCents: 300000, dueDate: '2026-11-15' }
  it('has no default amount', () => {
    expect(initialAmount(null)).toBe('')
    expect(initialAmount({ cents: 25000 })).toBe('250.00')
    expect(NO_RATE_HINT).toBe('Set your dues rate in Settings, or enter an amount')
  })
  it('summarizes homes, amount, total and due date', () => {
    expect(previewLine(facts, null)).toBe('12 homes, $250.00 each, $3,000.00 total, due Nov 15, 2026.')
    expect(previewLine(facts, 100)).toContain('$1,200.00 total')
    expect(skippedLine(3)).toBe('3 already billed for this month will be skipped.')
    expect(skippedLine(0)).toBeNull()
  })
  it('explains an empty run', () => {
    expect(emptyReason({ ...facts, toBill: 0 })).toMatch(/already billed/)
    expect(emptyReason(facts)).toBeNull()
  })
  it('toast uses created', () => {
    expect(billedToast(2, 'Nov')).toBe('Billed 2 homes for Nov')
    expect(billedToast(1, 'Nov')).toBe('Billed 1 home for Nov')
  })
  it('failure state copy', () => {
    expect(PREVIEW_FAILED).toBe('Couldn’t preview this run')
  })
})
