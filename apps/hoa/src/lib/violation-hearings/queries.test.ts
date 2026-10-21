import { describe, expect, it } from 'vitest'
import { loadBoardHearing, loadResidentHearing } from './queries'

// BL-133: flag off never touches the database (violation_hearings may not
// exist yet); flag on reads one org-scoped row.

function fakeDb(result: { data: Record<string, unknown> | null; error: { code: string } | null }) {
  const calls: Array<{ table?: string; method: string; args: unknown[] }> = []
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq']) {
    chain[m] = (...args: unknown[]) => {
      calls.push({ method: m, args })
      return chain
    }
  }
  chain.maybeSingle = async () => result
  return {
    calls,
    db: {
      from: (table: string) => {
        calls.push({ table, method: 'from', args: [] })
        return chain
      },
    },
  }
}

const row = {
  id: 'h-1',
  violation_id: 'v-1',
  status: 'scheduled',
  requested_at: null,
  resident_statement: null,
  hearing_on: '2026-11-20',
  hearing_time: '18:30',
  location: 'Clubhouse',
  panel: [{ name: 'A', role: 'member' }],
  notice_sent_on: null,
  outcome: null,
  decided_on: null,
  findings_sent_on: null,
  payment_due_on: null,
}

describe('loadBoardHearing', () => {
  it('flag off: off, no query', async () => {
    const f = fakeDb({ data: row, error: null })
    expect(await loadBoardHearing(f.db, 'org-1', 'v-1', false)).toEqual({ kind: 'off' })
    expect(f.calls).toHaveLength(0)
  })

  it('flag on: one org-scoped read of the violation’s hearing', async () => {
    const f = fakeDb({ data: row, error: null })
    const res = await loadBoardHearing(f.db, 'org-1', 'v-1', true)
    expect(res.kind).toBe('ok')
    expect(res.kind === 'ok' && res.hearing?.panel).toEqual([{ name: 'A', role: 'member' }])
    expect(f.calls[0]).toEqual({ table: 'violation_hearings', method: 'from', args: [] })
    expect(f.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toEqual([
      ['organization_id', 'org-1'],
      ['violation_id', 'v-1'],
    ])
  })

  it('flag on: a failed read is "failed", never "none recorded"', async () => {
    const f = fakeDb({ data: null, error: { code: '42P01' } })
    expect(await loadBoardHearing(f.db, 'org-1', 'v-1', true)).toEqual({ kind: 'failed' })
  })
})

describe('loadResidentHearing', () => {
  it('flag off: off, no query', async () => {
    const f = fakeDb({ data: row, error: null })
    expect(await loadResidentHearing(f.db, 'org-1', 'v-1', false)).toEqual({ kind: 'off' })
    expect(f.calls).toHaveLength(0)
  })

  it('flag on: limited columns; the date stays hidden until the notice is sent', async () => {
    const f = fakeDb({ data: row, error: null })
    const res = await loadResidentHearing(f.db, 'org-1', 'v-1', true)
    const select = f.calls.find((c) => c.method === 'select')!.args[0] as string
    expect(select).not.toContain('panel')
    expect(select).not.toContain('resident_statement')
    expect(res).toEqual({
      kind: 'ok',
      hearing: { status: 'scheduled', requestedAt: null, hearingOn: null, hearingTime: null, location: null, outcome: null, decidedOn: null, paymentDueOn: null },
    })
  })
})
