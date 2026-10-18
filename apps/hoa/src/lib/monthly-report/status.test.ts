import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { monthlyReportCommunicationId } from '@homeowner-portal/jobs/monthly-board-report'
import { loadMonthlyReportStatus } from './status'

function fakeDb(latest: { data: unknown; error: unknown }, existing: { data: unknown; error: unknown }) {
  const eqs: unknown[][] = []
  return {
    eqs,
    db: {
      from: () => {
        let byId = false
        const chain: Record<string, unknown> = {}
        for (const m of ['select', 'is', 'order', 'range']) chain[m] = () => chain
        chain.eq = (...args: unknown[]) => {
          eqs.push(args)
          if (args[0] === 'id') byId = true
          return chain
        }
        chain.maybeSingle = () => Promise.resolve(existing)
        chain.then = (resolve: (v: unknown) => void) => resolve(byId ? existing : latest)
        return chain
      },
    } as unknown as SupabaseClient,
  }
}

const NOW = new Date('2026-10-17T15:00:00Z')

describe('loadMonthlyReportStatus', () => {
  it('reads the last report from the communications log and checks last month by its deterministic id', async () => {
    const { db, eqs } = fakeDb(
      { data: [{ status: 'sent', sent_at: '2026-10-01T12:05:00Z', related_resource: { type: 'monthly_board_report', month: '2026-09' } }], error: null },
      { data: { id: 'x' }, error: null },
    )
    const s = await loadMonthlyReportStatus(db, 'org-1', 'America/New_York', NOW)
    expect(s).toEqual({
      last: { month: '2026-09', label: 'September 2026', status: 'sent', sentAt: '2026-10-01T12:05:00Z' },
      pending: expect.objectContaining({ month: '2026-09' }),
      pendingDone: true,
    })
    expect(eqs).toContainEqual(['organization_id', 'org-1'])
    expect(eqs).toContainEqual(['related_resource->>type', 'monthly_board_report'])
    expect(eqs).toContainEqual(['id', monthlyReportCommunicationId('org-1', '2026-09')])
  })

  it('never sent: no last report, last month due', async () => {
    const { db } = fakeDb({ data: [], error: null }, { data: null, error: null })
    expect(await loadMonthlyReportStatus(db, 'org-1', 'America/New_York', NOW)).toMatchObject({ last: null, pendingDone: false })
  })

  it('throws on a failed read so the card says "couldn\'t load", not "never sent"', async () => {
    const { db } = fakeDb({ data: null, error: { code: '42501' } }, { data: null, error: null })
    await expect(loadMonthlyReportStatus(db, 'org-1', 'America/New_York', NOW)).rejects.toThrow()
  })
})
