import { describe, expect, it, vi } from 'vitest'
import { ESTOPPEL_PRINTED, estoppelAuditRow, recordEstoppelAudit } from './audit'

const metadata = {
  property_id: 'p1',
  unit_id: 'u1',
  jurisdiction: 'FL' as const,
  balance_cents: 45_000,
  past_due_cents: 50_000,
  not_yet_due_cents: 80_000,
  open_violation_ids: ['v1'],
  payment_plan_id: null,
  collection_case_id: null,
  request_date: '2026-10-09',
  issue_date: '2026-10-19',
  delivery: 'electronic' as const,
  expedited: false,
  fee_cents: 25_000,
}

describe('estoppel audit row', () => {
  it('is keyed to the property and carries only ids, days, choices and cents', () => {
    const row = estoppelAuditRow({ action: ESTOPPEL_PRINTED, orgId: 'o1', userId: 'u', metadata })
    expect(row).toMatchObject({ action: 'estoppel_printed', org_id: 'o1', user_id: 'u', entity_type: 'hoa_property', entity_id: 'p1' })
    expect(Object.keys(row.metadata).sort()).toEqual(Object.keys(metadata).sort())
  })

  it('returns the failure so the caller refuses to print', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: '42501' } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await recordEstoppelAudit({ from: () => ({ insert }) }, { action: ESTOPPEL_PRINTED, orgId: 'o1', userId: 'u', metadata })
    expect(res).toEqual({ ok: false, code: '42501' })
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/45000|p1/)
    spy.mockRestore()
  })
})
