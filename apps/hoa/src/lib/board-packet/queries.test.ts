import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LIST_CAP,
  PACKET_MEETING_COLUMNS,
  loadDelinquency,
  loadOpenArc,
  loadOpenViolations,
  loadPreviousMeeting,
  packetMeetingQuery,
} from './queries'
import { readAll } from '@/lib/supabase/read-all'
import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'

/**
 * A stand-in for the Supabase client that behaves like PostgREST where it
 * matters here: every response is capped at `cap` rows WHATEVER range is
 * asked for (max_rows = 1000 in supabase/config.toml). Filters are not
 * evaluated — each table returns its fixture rows — but every builder
 * call is recorded so a test can check how a query was shaped.
 */
interface Call {
  table: string
  ops: [string, ...unknown[]][]
}

function fakeDb(
  tables: Record<string, unknown[]>,
  opts: { cap?: number; failAt?: { table: string; from: number } } = {},
): { db: SupabaseClient; calls: Call[] } {
  const cap = opts.cap ?? 1000
  const calls: Call[] = []
  const db = {
    from(table: string) {
      const call: Call = { table, ops: [] }
      calls.push(call)
      let range: [number, number] = [0, Number.MAX_SAFE_INTEGER]
      const builder: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'is', 'in', 'not', 'lt', 'lte', 'gte', 'order']) {
        builder[m] = (...args: unknown[]) => {
          call.ops.push([m, ...args])
          return builder
        }
      }
      builder.range = (from: number, to: number) => {
        call.ops.push(['range', from, to])
        range = [from, to]
        return builder
      }
      builder.then = (resolve: (v: unknown) => unknown) => {
        if (opts.failAt && opts.failAt.table === table && opts.failAt.from === range[0]) {
          return Promise.resolve({ data: null, error: { code: '57014', message: 'timeout' } }).then(resolve)
        }
        const rows = tables[table] ?? []
        const end = Math.min(range[1] + 1, range[0] + cap)
        return Promise.resolve({ data: rows.slice(range[0], end), error: null }).then(resolve)
      }
      return builder
    },
  }
  return { db: db as unknown as SupabaseClient, calls }
}

const ranges = (calls: Call[], table: string) =>
  calls.filter((c) => c.table === table).flatMap((c) => c.ops.filter((o) => o[0] === 'range').map((o) => [o[1], o[2]]))

describe('readAll — reads past the server row cap', () => {
  it('returns every row when the server caps responses at 1000', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i }))
    const { db, calls } = fakeDb({ t: rows })
    const got = await readAll<{ id: number }>((f, t) => db.from('t').select('id').order('id').range(f, t) as never, () => new Error('x'))
    expect(got).toHaveLength(2500)
    expect(ranges(calls, 't')).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })

  it('still gets everything when the cap is below its page size (short pages are not the end)', async () => {
    const rows = Array.from({ length: 1234 }, (_, i) => ({ id: i }))
    const { db } = fakeDb({ t: rows }, { cap: 400 })
    const got = await readAll<{ id: number }>((f, t) => db.from('t').select('id').range(f, t) as never, () => new Error('x'))
    expect(got.map((r) => r.id)).toEqual(rows.map((r) => r.id))
  })

  it('an error on a later page throws — never a partial result', async () => {
    const { db } = fakeDb({ t: Array.from({ length: 1500 }, (_, i) => ({ id: i })) }, { failAt: { table: 't', from: 1000 } })
    await expect(
      readAll((f, t) => db.from('t').select('id').range(f, t) as never, (e) => new Error(`failed ${e.code}`)),
    ).rejects.toThrow('failed 57014')
  })
})

describe('loadDelinquency — totals from the full set, not a page', () => {
  const charges = Array.from({ length: 2600 }, (_, i) => ({
    id: `c${i}`,
    amount: 100,
    due_date: '2026-09-01',
    unit_id: `u${i % 1300}`,
    status: i % 2 === 0 ? 'partial' : 'open',
    payments: i % 2 === 0 ? [{ amount: 25, paid_at: '2026-09-10T15:00:00Z' }] : [],
    unit: { unit_number: `U${i % 1300}`, address_line1: null },
  }))

  it('sums every overdue charge even though each response holds at most 1000', async () => {
    const { db, calls } = fakeDb({ assessments: charges })
    const s = await loadDelinquency(db, 'assoc-1', '2026-10-16', 'America/New_York')
    // 1300 charges at 100 + 1300 at 75. A single capped read gave 1000 rows ($87,500).
    expect(s.totalOverdue).toBe(1300 * 100 + 1300 * 75)
    expect(s.chargeCount).toBe(2600)
    expect(s.unitCount).toBe(1300)
    expect(ranges(calls, 'assessments').length).toBeGreaterThan(1)
  })

  it('pages in a stable order and filters to overdue, live, not-waived charges', async () => {
    const { db, calls } = fakeDb({ assessments: charges.slice(0, 10) })
    await loadDelinquency(db, 'assoc-1', '2026-10-16', 'America/New_York')
    const ops = calls[0]!.ops
    expect(ops).toContainEqual(['order', 'id', { ascending: true }])
    expect(ops).toContainEqual(['eq', 'association_id', 'assoc-1'])
    expect(ops).toContainEqual(['is', 'deleted_at', null])
    // 'paid' is read too: a charge paid since the as-of day still owed then.
    expect(ops).toContainEqual(['not', 'status', 'in', '("waived","written_off")'])
    expect(ops).toContainEqual(['lt', 'due_date', '2026-10-16'])
    expect(ops).toContainEqual(['select', 'id, amount, due_date, status, unit_id, payments(amount, paid_at), unit:unit_id(unit_number, address_line1)'])
  })

  it('a failed page fails the section instead of reporting a smaller total', async () => {
    const { db } = fakeDb({ assessments: charges }, { failAt: { table: 'assessments', from: 2000 } })
    await expect(loadDelinquency(db, 'assoc-1', '2026-10-16', 'America/New_York')).rejects.toThrow(/overdue charges failed \(57014\)/)
  })
})

describe('loadDelinquency — as of the close of the packet month (BL-051)', () => {
  // Fixtures with activity after Sep 30. The fake evaluates the filters,
  // so this proves the query and the summary together.
  const unit = { unit_number: 'U1', address_line1: null }
  const base = { association_id: 'assoc-1', deleted_at: null, unit }
  const assessments = [
    // Due in September, unpaid then, paid in full on Oct 12: owed $325 at month-end.
    { ...base, id: 'a1', unit_id: 'u1', amount: 325, due_date: '2026-09-01', status: 'paid', payments: [{ amount: 325, paid_at: '2026-10-12T14:00:00Z' }] },
    // Due in August, $100 paid in September, $150 more on Oct 5: owed $200.
    { ...base, id: 'a2', unit_id: 'u2', amount: 300, due_date: '2026-08-01', status: 'partial', payments: [{ amount: 100, paid_at: '2026-09-20T16:00:00Z' }, { amount: 150, paid_at: '2026-10-05T16:00:00Z' }] },
    // Due Oct 1 and Oct 10: not due yet at month-end.
    { ...base, id: 'a3', unit_id: 'u3', amount: 999, due_date: '2026-10-01', status: 'open', payments: [] },
    { ...base, id: 'a4', unit_id: 'u3', amount: 999, due_date: '2026-10-10', status: 'open', payments: [] },
    // Paid in September: settled.
    { ...base, id: 'a5', unit_id: 'u4', amount: 325, due_date: '2026-09-01', status: 'paid', payments: [{ amount: 325, paid_at: '2026-09-05T14:00:00Z' }] },
    // Waived, and another association's charge: never counted.
    { ...base, id: 'a6', unit_id: 'u5', amount: 50, due_date: '2026-09-01', status: 'waived', payments: [] },
    { ...base, id: 'a7', unit_id: 'u6', association_id: 'assoc-2', amount: 70, due_date: '2026-09-01', status: 'open', payments: [] },
  ]

  it('counts what was owed at the close of Sep 30, not current balances', async () => {
    const { db } = cappedFakeDb({ assessments })
    const s = await loadDelinquency(db, 'assoc-1', '2026-10-01', 'America/New_York')
    expect(s.asOf).toBe('2026-10-01')
    expect(s.totalOverdue).toBe(525)
    expect(s.chargeCount).toBe(2)
    expect(s.units.map((u) => [u.key, u.amount, u.daysOverdue])).toEqual([
      ['u1', 325, 30],
      ['u2', 200, 61],
    ])
  })
})

describe('open violations / ARC — the count is the full set; only the list is capped', () => {
  const violations = Array.from({ length: 1230 }, (_, i) => ({
    id: `v${i}`,
    status: i < 1000 ? 'notice_sent' : 'open',
    violation_type: 'Landscaping',
    severity: null,
    created_at: '2026-09-01T00:00:00Z',
    property: null,
  }))

  it('total and per-status counts cover every open violation', async () => {
    const { db, calls } = fakeDb({ hoa_violations: violations })
    const v = await loadOpenViolations(db, 'org-1')
    expect(v.total).toBe(1230)
    expect(v.byStatus).toEqual({ notice_sent: 1000, open: 230 })
    expect(v.rows).toHaveLength(LIST_CAP)
    // The printed list asked for exactly one page of LIST_CAP rows.
    expect(ranges(calls, 'hoa_violations')).toContainEqual([0, LIST_CAP - 1])
  })

  it('ARC applications: same contract, scoped by organization_id', async () => {
    const arc = Array.from({ length: 75 }, (_, i) => ({ id: `a${i}`, status: i % 3 === 0 ? 'in_review' : 'submitted' }))
    const { db, calls } = fakeDb({ arc_requests: arc })
    const a = await loadOpenArc(db, 'org-1')
    expect(a.total).toBe(75)
    expect(a.byStatus).toEqual({ in_review: 25, submitted: 50 })
    expect(a.rows).toHaveLength(LIST_CAP)
    for (const c of calls) expect(c.ops).toContainEqual(['eq', 'organization_id', 'org-1'])
  })
})

describe('loadPreviousMeeting', () => {
  it('returns the latest earlier meeting and every one of its action items', async () => {
    const items = Array.from({ length: 1100 }, (_, i) => ({ id: `i${i}`, title: 't', assignee_name: null, due_date: null, status: 'open' }))
    const { db, calls } = fakeDb({
      hoa_meeting_minutes: [{ id: 'm0', meeting_date: '2026-09-10', meeting_type: 'regular' }],
      meeting_action_items: items,
    })
    const p = await loadPreviousMeeting(db, 'org-1', '2026-10-14')
    expect(p.meeting?.id).toBe('m0')
    expect(p.items).toHaveLength(1100)
    const prevOps = calls.find((c) => c.table === 'hoa_meeting_minutes')!.ops
    expect(prevOps).toContainEqual(['lt', 'meeting_date', '2026-10-14'])
    expect(prevOps).toContainEqual(['order', 'meeting_date', { ascending: false }])
  })

  it('no earlier meeting is a real empty result, not a failure', async () => {
    const { db } = fakeDb({ hoa_meeting_minutes: [] })
    expect(await loadPreviousMeeting(db, 'org-1', '2026-10-14')).toEqual({ meeting: null, items: [] })
  })
})

describe('the packet’s own meeting (security review #3, SEC3-L9)', () => {
  it('reads the meeting by id AND the caller’s org, live rows only', async () => {
    const ops: [string, ...unknown[]][] = []
    const tables: string[] = []
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'is']) {
      builder[m] = (...args: unknown[]) => {
        ops.push([m, ...args])
        return builder
      }
    }
    builder.maybeSingle = () => {
      ops.push(['maybeSingle'])
      return Promise.resolve({ data: null, error: null })
    }
    const db = {
      from: (t: string) => {
        tables.push(t)
        return builder
      },
    } as unknown as SupabaseClient

    expect(await packetMeetingQuery(db, 'org-1', 'm-9')).toEqual({ data: null, error: null })
    expect(tables).toEqual(['hoa_meeting_minutes'])
    expect(ops).toContainEqual(['select', PACKET_MEETING_COLUMNS])
    expect(ops).toContainEqual(['eq', 'id', 'm-9'])
    expect(ops).toContainEqual(['eq', 'org_id', 'org-1'])
    expect(ops).toContainEqual(['is', 'deleted_at', null])
    expect(PACKET_MEETING_COLUMNS.split(', ')).toContain('org_id')
  })

  it('the packet page reads its meeting through it, with the gate’s org, before any service-role client', () => {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const page = readFileSync(path.resolve(here, '../../app/(dashboard)/meetings/[id]/packet/page.tsx'), 'utf8')
    // No unscoped read of the meeting left in the page.
    expect(page).not.toMatch(/from\('hoa_meeting_minutes'\)/)
    const gate = page.indexOf('const { org } = await requireBoardOrAdmin()')
    const read = page.indexOf('packetMeetingQuery(supabase, org.id, id)')
    const admin = page.indexOf('createAdminClient()')
    expect(gate).toBeGreaterThan(-1)
    expect(read).toBeGreaterThan(gate)
    expect(admin).toBeGreaterThan(read)
  })
})
