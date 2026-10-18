import { describe, expect, it, vi } from 'vitest'
import { recordRosterExport, rosterAuditRow } from './audit'

const args = {
  orgId: 'org-1',
  userId: 'user-1',
  kind: 'voters' as const,
  asOf: '2026-10-18',
  format: 'csv' as const,
  counts: { homes: 57, noOwner: 2, mayBeSuspended: 3 },
}

describe('roster export audit row', () => {
  it('carries counts and choices only', () => {
    const row = rosterAuditRow(args)
    expect(row).toEqual({
      action: 'statutory_roster_export',
      org_id: 'org-1',
      user_id: 'user-1',
      entity_type: 'org',
      entity_id: 'org-1',
      metadata: { kind: 'voters', as_of: '2026-10-18', format: 'csv', counts: { homes: 57, noOwner: 2, mayBeSuspended: 3 } },
    })
    // Nothing but numbers under counts.
    expect(Object.values(row.metadata.counts).every((v) => typeof v === 'number')).toBe(true)
  })

  it('a failed insert is reported (code only) so the export is refused', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = { from: () => ({ insert: async () => ({ error: { code: '42501', message: 'row violates policy for 12 Oak Lane' } }) }) }
    expect(await recordRosterExport(db, args)).toEqual({ ok: false, code: '42501' })
    expect(JSON.stringify(err.mock.calls)).not.toContain('Oak')
    err.mockRestore()
  })

  it('ok when written', async () => {
    const insert = vi.fn(async () => ({ error: null }))
    expect(await recordRosterExport({ from: () => ({ insert }) }, args)).toEqual({ ok: true })
    expect(insert).toHaveBeenCalledOnce()
  })
})
