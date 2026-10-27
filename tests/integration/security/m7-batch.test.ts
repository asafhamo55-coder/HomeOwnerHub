/**
 * Migration 0072 (migrations/0072_m7_batch.sql, batch M7) against real
 * Postgres. CI only (no local database).
 *
 *   BL-166  mail tracking columns on collection_events: allowed (board
 *           records them), denied (bad method, orphan tracking number,
 *           delivered before mailed, other org, resident, any edit),
 *           and the attorney sees them only on an assigned case.
 *   BL-177  record_lump_payment(): allowed, denied (anon, resident, other
 *           org, a home or charge of another org), cross-org, over-
 *           application, a repeated charge, the atomic rollback (the 3rd
 *           part fails and NOTHING is posted), credit; and the
 *           unapplied_credits table's rules and same-org triggers.
 *   BL-176  associations: a board member's REST PATCH of state,
 *           governing_law_state or type is refused; an admin and the
 *           service role may; other columns stay open to the board.
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds; every RLS assertion
 * about a user runs through that user's own client. Ids and counts only.
 * The new columns, table and function are not in the generated Database
 * types until gen:types runs after prod has 0072 (CLAUDE.md footgun 3),
 * hence the casts.
 */
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import { LOCAL_ANON_KEY, LOCAL_SUPABASE_URL } from '../setup/env'
import {
  adminDb,
  makeAccounting,
  makeOrg,
  makeUnit,
  mintUser,
  type AccountingRefs,
  type OrgFixture,
  type TestUser,
} from '../fixtures/factory'
import { psqlRows } from '../fixtures/psql'
import { truncateAll } from '../fixtures/truncate'

let org: OrgFixture
let other: OrgFixture
let acct: AccountingRefs
let acctOther: AccountingRefs
let board: TestUser
let admin: TestUser
let resident: TestUser
let residentElsewhere: TestUser
let otherBoard: TestUser
let otherAdmin: TestUser
let attorney: TestUser
let unit: string
let unit2: string
let otherUnit: string
let caseId: string
let case2Id: string
let a1: string
let a2: string
let a3: string
let a4OtherUnit: string
let aOtherOrg: string

const FUTURE = new Date(Date.now() + 90 * 86_400_000).toISOString()
const TODAY = new Date().toISOString().slice(0, 10)

async function insertOne(t: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await adminDb().from(t as never).insert(row as never).select('id').single()
  if (error || !data) throw new Error(`seed ${t}: ${error?.code ?? 'no row'} ${error?.message ?? ''}`)
  return (data as { id: string }).id
}

const assessment = (f: OrgFixture, a: AccountingRefs, unitId: string, amount: number, extra: Record<string, unknown> = {}) =>
  insertOne('assessments', {
    organization_id: f.orgId,
    association_id: f.associationId,
    unit_id: unitId,
    fiscal_period_id: a.fiscalPeriodId,
    assessment_type: 'regular',
    amount,
    due_date: '2026-01-01',
    status: 'open',
    ...extra,
  })

type Rpc = { data: unknown; error: { code?: string; message: string } | null }
const lump = (
  who: TestUser,
  args: { org?: string; unit?: string; parts: unknown; method?: string; paidOn?: string; note?: string | null },
): Promise<Rpc> =>
  who.client.rpc('record_lump_payment' as never, {
    p_org: args.org ?? org.orgId,
    p_unit: args.unit ?? unit,
    p_parts: args.parts,
    p_method: args.method ?? 'check',
    p_paid_on: args.paidOn ?? TODAY,
    p_note: args.note ?? null,
  } as never) as unknown as Promise<Rpc>

async function counts() {
  const db = adminDb()
  const n = async (t: string, col = 'organization_id') => {
    const { count } = await db.from(t as never).select('id', { count: 'exact', head: true }).eq(col as never, org.orgId)
    return count ?? 0
  }
  return {
    payments: await n('payments'),
    entries: await n('journal_entries'),
    lines: await n('ledger_entries'),
    credits: await n('unapplied_credits'),
    audits: await n('audit_log', 'org_id'),
  }
}

async function statusOf(id: string): Promise<string> {
  const { data } = await adminDb().from('assessments').select('status').eq('id', id).single()
  return (data as { status: string }).status
}

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  other = await makeOrg()
  acct = await makeAccounting(org)
  acctOther = await makeAccounting(other)
  board = await mintUser(org, 'board')
  admin = await mintUser(org, 'admin')
  resident = await mintUser(org, 'resident')
  residentElsewhere = await mintUser(org, 'resident')
  otherBoard = await mintUser(other, 'board')
  otherAdmin = await mintUser(other, 'admin')
  attorney = await mintUser(org, 'attorney', { accessExpiresAt: FUTURE })

  unit = await makeUnit(org)
  unit2 = await makeUnit(org)
  otherUnit = await makeUnit(other)
  await insertOne('ownerships', { organization_id: org.orgId, unit_id: unit, owner_user_id: resident.id, owner_name: 'Test Owner', valid_from: '2024-01-01' })
  await insertOne('ownerships', { organization_id: org.orgId, unit_id: unit2, owner_user_id: residentElsewhere.id, owner_name: 'Test Owner Two', valid_from: '2024-01-01' })

  a1 = await assessment(org, acct, unit, 100)
  a2 = await assessment(org, acct, unit, 100, { due_date: '2026-02-01' })
  a3 = await assessment(org, acct, unit, 100, { due_date: '2026-03-01' })
  a4OtherUnit = await assessment(org, acct, unit2, 100)
  aOtherOrg = await assessment(other, acctOther, otherUnit, 100)

  caseId = await insertOne('collection_cases', { organization_id: org.orgId, association_id: org.associationId, unit_id: unit })
  case2Id = await insertOne('collection_cases', { organization_id: org.orgId, association_id: org.associationId, unit_id: unit2 })
})

// ───────────────────────── BL-166 ─────────────────────────

describe('0072 BL-166: mail tracking on collection events', () => {
  const event = (extra: Record<string, unknown>, orgId = org.orgId, c = caseId) => ({
    organization_id: orgId,
    collection_case_id: c,
    event_type: 'collection_letter_sent',
    occurred_on: '2026-09-01',
    ...extra,
  })

  it('allowed: the board records how and when a notice was mailed and delivered', async () => {
    const r = await board.client
      .from('collection_events' as never)
      .insert(event({ mail_method: 'certified', tracking_number: '9407 1000 0000 0000 0000 00', mailed_on: '2026-09-01', delivered_on: '2026-09-04' }) as never)
      .select('id, mail_method, tracking_number, mailed_on, delivered_on')
      .single()
    expect(r.error).toBeNull()
    expect(r.data).toMatchObject({ mail_method: 'certified', mailed_on: '2026-09-01', delivered_on: '2026-09-04' })
    // Nullable: an event with none of it is unchanged behaviour.
    const plain = await board.client.from('collection_events' as never).insert(event({}) as never).select('id, mail_method').single()
    expect(plain.error).toBeNull()
    expect((plain.data as unknown as { mail_method: string | null }).mail_method).toBeNull()
  })

  it.each(['certified', 'statutory_overnight', 'first_class', 'email', 'hand'])('allowed: method %s', async (m) => {
    const r = await board.client.from('collection_events' as never).insert(event({ mail_method: m }) as never)
    expect(r.error).toBeNull()
  })

  it('denied: an unknown method, a tracking number or date without a method, delivered before mailed, an empty or 101-char number', async () => {
    const bad = async (extra: Record<string, unknown>) => (await board.client.from('collection_events' as never).insert(event(extra) as never)).error?.code
    expect(await bad({ mail_method: 'carrier_pigeon' })).toBe('23514')
    expect(await bad({ tracking_number: 'ABC' })).toBe('23514')
    expect(await bad({ mailed_on: '2026-09-01' })).toBe('23514')
    expect(await bad({ delivered_on: '2026-09-01' })).toBe('23514')
    expect(await bad({ mail_method: 'certified', mailed_on: '2026-09-05', delivered_on: '2026-09-04' })).toBe('23514')
    expect(await bad({ mail_method: 'certified', tracking_number: '   ' })).toBe('23514')
    expect(await bad({ mail_method: 'certified', tracking_number: 'x'.repeat(101) })).toBe('23514')
  })

  it('cross-org: another org’s board cannot write or read these rows, and a row cannot carry a foreign org', async () => {
    const own = await board.client.from('collection_events' as never).insert(event({ mail_method: 'certified', tracking_number: 'T-1' }) as never).select('id').single()
    expect(own.error).toBeNull()
    const planted = await otherBoard.client.from('collection_events' as never).insert(event({ mail_method: 'certified' }) as never)
    expect(planted.error?.code).toBe('42501')
    const read = await otherBoard.client.from('collection_events' as never).select('id, tracking_number')
    expect((read.data ?? []).length).toBe(0)
    const boardClaimsOther = await board.client.from('collection_events' as never).insert(event({ mail_method: 'certified' }, other.orgId) as never)
    expect(boardClaimsOther.error?.code).toBe('42501')
  })

  it('denied: a resident reads none of it, and nobody edits or deletes the trail', async () => {
    const ins = await board.client.from('collection_events' as never).insert(event({ mail_method: 'certified', tracking_number: 'T-2' }) as never).select('id').single()
    const id = (ins.data as unknown as { id: string }).id
    expect(((await resident.client.from('collection_events' as never).select('id')).data ?? []).length).toBe(0)
    for (const who of [board, admin]) {
      await who.client.from('collection_events' as never).update({ delivered_on: '2026-09-09' } as never).eq('id', id)
      await who.client.from('collection_events' as never).delete().eq('id', id)
    }
    const { data } = await adminDb().from('collection_events' as never).select('tracking_number, delivered_on').eq('id', id).single()
    expect(data).toMatchObject({ tracking_number: 'T-2', delivered_on: null })
  })

  it('attorney: reads the mail columns of an assigned case only', async () => {
    const mine = await adminDb().from('collection_events' as never).insert(event({ mail_method: 'certified', tracking_number: 'T-ASSIGNED' }) as never).select('id').single()
    const theirs = await adminDb().from('collection_events' as never).insert(event({ mail_method: 'certified', tracking_number: 'T-OTHER' }, org.orgId, case2Id) as never).select('id').single()
    await insertOne('matter_assignments', { organization_id: org.orgId, user_id: attorney.id, matter_type: 'collections_case', matter_id: caseId })
    const { data, error } = await attorney.client.from('collection_events' as never).select('id, tracking_number')
    expect(error).toBeNull()
    expect((data ?? []) as Array<{ id: string; tracking_number: string }>).toEqual([
      { id: (mine.data as unknown as { id: string }).id, tracking_number: 'T-ASSIGNED' },
    ])
    expect(((data ?? []) as Array<{ id: string }>).map((r) => r.id)).not.toContain((theirs.data as unknown as { id: string }).id)
  })
})

// ───────────────────────── BL-177 ─────────────────────────

describe('0072 BL-177: record_lump_payment()', () => {
  it('allowed: posts every part in one go (payments, balanced entries, new statuses)', async () => {
    const r = await lump(board, { parts: [{ assessment_id: a1, cents: 10000 }, { assessment_id: a2, cents: 4000 }], note: 'Check 1042' })
    expect(r.error).toBeNull()
    const out = r.data as unknown as { payment_ids: string[]; journal_entry_ids: string[]; applied_cents: number; credit_cents: number }
    expect(out.payment_ids.length).toBe(2)
    expect(out.applied_cents).toBe(14000)
    expect(out.credit_cents).toBe(0)
    expect(await statusOf(a1)).toBe('paid')
    expect(await statusOf(a2)).toBe('partial')
    expect(await statusOf(a3)).toBe('open')
    const c = await counts()
    expect(c.payments).toBe(2)
    expect(c.entries).toBe(2)
    expect(c.lines).toBe(4)
    // Every entry is posted and balances overall.
    const sums = psqlRows<{ id: string; status: string; d: string; c: string; n: number }>(
      `select j.id, j.status, sum(l.debit_amount)::text d, sum(l.credit_amount)::text c, count(*)::int n
         from public.journal_entries j join public.ledger_entries l on l.journal_entry_id = j.id
        where j.organization_id = '${org.orgId}' group by j.id, j.status`,
    )
    expect(sums.length).toBe(2)
    for (const s of sums) {
      expect(s.status).toBe('posted')
      expect(s.d).toBe(s.c)
      expect(s.n).toBe(2)
    }
    // The payment row links to its entry.
    const { data: pays } = await adminDb().from('payments').select('journal_entry_id, unit_id, payment_method').eq('organization_id', org.orgId)
    for (const p of pays ?? []) {
      expect(p.journal_entry_id).not.toBeNull()
      expect(p.unit_id).toBe(unit)
      expect(p.payment_method).toBe('check')
    }
    // A second lump payment can finish a part-paid charge, and not one cent more.
    const rest = await lump(board, { parts: [{ assessment_id: a2, cents: 6000 }] })
    expect(rest.error).toBeNull()
    expect(await statusOf(a2)).toBe('paid')
    const more = await lump(board, { parts: [{ assessment_id: a2, cents: 1 }] })
    expect(more.error?.code).toBe('22023') // already settled
  })

  it('allowed: an admin may too; entry numbers do not collide', async () => {
    expect((await lump(admin, { parts: [{ assessment_id: a1, cents: 5000 }] })).error).toBeNull()
    expect((await lump(board, { parts: [{ assessment_id: a2, cents: 5000 }] })).error).toBeNull()
    const nums = psqlRows<{ entry_number: string }>(`select entry_number from public.journal_entries where organization_id = '${org.orgId}'`)
    expect(new Set(nums.map((n) => n.entry_number)).size).toBe(2)
  })

  it('credit: money beyond what is due is stored as an unapplied credit, and a resident reads only their own', async () => {
    const r = await lump(board, {
      parts: [{ assessment_id: a1, cents: 10000 }, { kind: 'credit', cents: 2500 }],
      method: 'ach',
      note: 'Paid ahead',
    })
    expect(r.error).toBeNull()
    expect(r.data).toMatchObject({ applied_cents: 10000, credit_cents: 2500 })
    const mine = await resident.client.from('unapplied_credits' as never).select('id, unit_id, amount, remaining')
    expect(mine.error).toBeNull()
    expect(mine.data).toHaveLength(1)
    expect(mine.data![0]).toMatchObject({ unit_id: unit, amount: 25, remaining: 25 })
    // A resident of another home, and another org's board, see none.
    expect(((await residentElsewhere.client.from('unapplied_credits' as never).select('id')).data ?? []).length).toBe(0)
    expect(((await otherBoard.client.from('unapplied_credits' as never).select('id')).data ?? []).length).toBe(0)
    expect(((await board.client.from('unapplied_credits' as never).select('id')).data ?? []).length).toBe(1)
    // The credit's entry is cash in, Prepaid Assessments (2100) out.
    const lines = psqlRows<{ account_number: string; debit_amount: string; credit_amount: string }>(
      `select c.account_number, l.debit_amount::text, l.credit_amount::text
         from public.unapplied_credits u
         join public.ledger_entries l on l.journal_entry_id = u.journal_entry_id
         join public.chart_of_accounts c on c.id = l.account_id
        where u.organization_id = '${org.orgId}' order by c.account_number`,
    )
    expect(lines.map((l) => l.account_number)).toEqual(['1010', '2100'])
    expect(Number(lines[0]!.debit_amount)).toBe(25)
    expect(Number(lines[1]!.credit_amount)).toBe(25)
    // Two credit parts in one call are refused.
    const two = await lump(board, { parts: [{ kind: 'credit', cents: 100 }, { kind: 'credit', cents: 100 }] })
    expect(two.error?.code).toBe('22023')
  })

  it('atomic: a failure on the 3rd part leaves NOTHING posted', async () => {
    const before = await counts()
    const r = await lump(board, {
      parts: [
        { assessment_id: a1, cents: 10000 },
        { assessment_id: a2, cents: 10000 },
        { assessment_id: a3, cents: 10001 }, // one cent too many
      ],
    })
    expect(r.error?.code).toBe('23514')
    expect(await counts()).toEqual(before)
    expect(await statusOf(a1)).toBe('open')
    expect(await statusOf(a2)).toBe('open')
    expect(await statusOf(a3)).toBe('open')
    // Same for a 3rd part that belongs to a neighbour.
    const r2 = await lump(board, {
      parts: [{ assessment_id: a1, cents: 100 }, { assessment_id: a2, cents: 100 }, { assessment_id: a4OtherUnit, cents: 100 }],
    })
    expect(r2.error?.code).toBe('23503')
    expect(await counts()).toEqual(before)
    // And for a credit part after a bad charge.
    const r3 = await lump(board, { parts: [{ assessment_id: a1, cents: 100 }, { assessment_id: a2, cents: 100 }, { assessment_id: a3, cents: 99999 }, { kind: 'credit', cents: 5 }] })
    expect(r3.error).not.toBeNull()
    expect(await counts()).toEqual(before)
  })

  it('over-application is refused, on a fresh charge and on a part-paid one', async () => {
    expect((await lump(board, { parts: [{ assessment_id: a1, cents: 10001 }] })).error?.code).toBe('23514')
    expect((await lump(board, { parts: [{ assessment_id: a1, cents: 7000 }] })).error).toBeNull()
    expect((await lump(board, { parts: [{ assessment_id: a1, cents: 3001 }] })).error?.code).toBe('23514')
    expect((await lump(board, { parts: [{ assessment_id: a1, cents: 3000 }] })).error).toBeNull()
    expect(await statusOf(a1)).toBe('paid')
  })

  it('refuses a repeated charge, zero or fractional cents, a bad method, a future date, an empty list', async () => {
    const code = async (args: Parameters<typeof lump>[1]) => (await lump(board, args)).error?.code
    expect(await code({ parts: [{ assessment_id: a1, cents: 100 }, { assessment_id: a1, cents: 100 }] })).toBe('22023')
    expect(await code({ parts: [{ assessment_id: a1, cents: 0 }] })).toBe('22023')
    expect(await code({ parts: [{ assessment_id: a1, cents: 10.5 }] })).toBe('22023')
    expect(await code({ parts: [{ assessment_id: a1, cents: -5 }] })).toBe('22023')
    expect(await code({ parts: [{ assessment_id: a1, cents: 100 }], method: 'bitcoin' })).toBe('22023')
    expect(await code({ parts: [{ assessment_id: a1, cents: 100 }], paidOn: '2999-01-01' })).toBe('22023')
    expect(await code({ parts: [] })).toBe('22023')
    expect(await code({ parts: { assessment_id: a1, cents: 100 } })).toBe('22023')
    expect(await code({ parts: [{ cents: 100 }] })).toBe('22023')
    expect(await code({ parts: [{ assessment_id: 'not-a-uuid', cents: 100 }] })).toBe('22023')
    expect(await counts()).toMatchObject({ payments: 0, entries: 0, credits: 0 })
  })

  it('denied: anon is refused in the body, whatever the grants say', async () => {
    const anon = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const r = await anon.rpc('record_lump_payment' as never, {
      p_org: org.orgId,
      p_unit: unit,
      p_parts: [{ assessment_id: a1, cents: 100 }],
      p_method: 'check',
      p_paid_on: TODAY,
      p_note: null,
    } as never)
    expect(r.error?.message ?? '').toMatch(/sign in first|permission denied/)
    expect(r.data).toBeNull()
    expect(await counts()).toMatchObject({ payments: 0, entries: 0 })
  })

  it('denied: a resident, a CPA-less outsider, and the service role (no session) post nothing', async () => {
    const res = await lump(resident, { parts: [{ assessment_id: a1, cents: 100 }] })
    expect(res.error?.code).toBe('42501')
    const svc = await adminDb().rpc('record_lump_payment' as never, {
      p_org: org.orgId,
      p_unit: unit,
      p_parts: [{ assessment_id: a1, cents: 100 }],
      p_method: 'check',
      p_paid_on: TODAY,
      p_note: null,
    } as never)
    expect(svc.error?.message ?? '').toMatch(/sign in first/)
    expect(await counts()).toMatchObject({ payments: 0, entries: 0 })
  })

  it('cross-org: another org’s board cannot post to this org, nor post this org’s charges into their own', async () => {
    const intoMine = await lump(otherBoard, { parts: [{ assessment_id: a1, cents: 100 }] }) // p_org = org
    expect(intoMine.error?.code).toBe('42501')
    // Their own org, but this org's home: the home is not in their org.
    const homeElsewhere = await lump(otherBoard, { org: other.orgId, unit, parts: [{ assessment_id: a1, cents: 100 }] })
    expect(homeElsewhere.error?.code).toBe('23503')
    // Their own org and home, this org's charge.
    const chargeElsewhere = await lump(otherBoard, { org: other.orgId, unit: otherUnit, parts: [{ assessment_id: a1, cents: 100 }] })
    expect(chargeElsewhere.error?.code).toBe('23503')
    // This org's board naming their charge, or their home.
    expect((await lump(board, { parts: [{ assessment_id: aOtherOrg, cents: 100 }] })).error?.code).toBe('23503')
    expect((await lump(board, { unit: otherUnit, parts: [{ assessment_id: aOtherOrg, cents: 100 }] })).error?.code).toBe('23503')
    // A charge of the same org but another home.
    expect((await lump(board, { parts: [{ assessment_id: a4OtherUnit, cents: 100 }] })).error?.code).toBe('23503')
    // A deleted charge.
    await adminDb().from('assessments').update({ deleted_at: new Date().toISOString() } as never).eq('id', a3)
    expect((await lump(board, { parts: [{ assessment_id: a3, cents: 100 }] })).error?.code).toBe('23503')
    expect(await counts()).toMatchObject({ payments: 0, entries: 0, credits: 0 })
    const { count } = await adminDb().from('payments').select('id', { count: 'exact', head: true }).eq('organization_id', other.orgId)
    expect(count ?? 0).toBe(0)
  })

  it('the function is pinned and closed to anon in the catalog', () => {
    const fn = psqlRows<{ definer: boolean; cfg: string[] | null; anon: boolean; authed: boolean }>(
      `select prosecdef definer, proconfig cfg,
              has_function_privilege('anon', oid, 'EXECUTE') anon,
              has_function_privilege('authenticated', oid, 'EXECUTE') authed
         from pg_proc where oid = 'public.record_lump_payment(uuid, uuid, jsonb, text, date, text)'::regprocedure`,
    )
    expect(fn[0]!.definer).toBe(true)
    expect(fn[0]!.cfg).toContain('search_path=public, pg_temp')
    expect(fn[0]!.authed).toBe(true)
  })
})

describe('0072 BL-177: unapplied_credits rules', () => {
  const credit = (extra: Record<string, unknown> = {}, orgId = org.orgId, u = unit, assoc = org.associationId) => ({
    organization_id: orgId,
    association_id: assoc,
    unit_id: u,
    amount: 10,
    remaining: 10,
    payment_method: 'check',
    received_on: '2026-09-01',
    ...extra,
  })

  it('allowed: board writes and reads its own org', async () => {
    const r = await board.client.from('unapplied_credits' as never).insert(credit() as never).select('id').single()
    expect(r.error).toBeNull()
    expect(((await board.client.from('unapplied_credits' as never).select('id')).data ?? []).length).toBe(1)
  })

  it('denied: a resident cannot write; another org’s board cannot read or write', async () => {
    expect((await resident.client.from('unapplied_credits' as never).insert(credit() as never)).error?.code).toBe('42501')
    expect((await otherBoard.client.from('unapplied_credits' as never).insert(credit() as never)).error?.code).toBe('42501')
    const seeded = await board.client.from('unapplied_credits' as never).insert(credit() as never).select('id').single()
    const id = (seeded.data as unknown as { id: string }).id
    await otherBoard.client.from('unapplied_credits' as never).update({ remaining: 0 } as never).eq('id', id)
    await resident.client.from('unapplied_credits' as never).update({ remaining: 0 } as never).eq('id', id)
    await resident.client.from('unapplied_credits' as never).delete().eq('id', id)
    const { data } = await adminDb().from('unapplied_credits' as never).select('remaining').eq('id', id).single()
    expect(Number((data as unknown as { remaining: number }).remaining)).toBe(10)
  })

  it('cross-org: a credit cannot point at another org’s home, association or entry (same-org triggers, 23503)', async () => {
    const unitPlant = await board.client.from('unapplied_credits' as never).insert(credit({}, org.orgId, otherUnit) as never)
    expect(unitPlant.error?.code).toBe('23503')
    const assocPlant = await board.client.from('unapplied_credits' as never).insert(credit({}, org.orgId, unit, other.associationId) as never)
    expect(assocPlant.error?.code).toBe('23503')
    const foreignJe = await insertOne('journal_entries', {
      organization_id: other.orgId,
      association_id: other.associationId,
      fiscal_period_id: acctOther.fiscalPeriodId,
      entry_number: 'JE-2026-90001',
      entry_date: '2026-09-01',
      memo: 'x',
      source: 'manual',
    })
    const jePlant = await board.client.from('unapplied_credits' as never).insert(credit({ journal_entry_id: foreignJe }) as never)
    expect(jePlant.error?.code).toBe('23503')
    // The trigger holds for the service role too.
    const svc = await adminDb().from('unapplied_credits' as never).insert(credit({}, org.orgId, otherUnit) as never)
    expect(svc.error?.code).toBe('23503')
  })

  it('CHECKs: positive amount, remaining within amount, known method', async () => {
    const bad = async (extra: Record<string, unknown>) => (await board.client.from('unapplied_credits' as never).insert(credit(extra) as never)).error?.code
    expect(await bad({ amount: 0, remaining: 0 })).toBe('23514')
    expect(await bad({ remaining: 11 })).toBe('23514')
    expect(await bad({ remaining: -1 })).toBe('23514')
    expect(await bad({ payment_method: 'bitcoin' })).toBe('23514')
  })

  it('anon reads nothing', async () => {
    await board.client.from('unapplied_credits' as never).insert(credit() as never)
    const anon = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const r = await anon.from('unapplied_credits' as never).select('id')
    expect(r.error?.code === '42501' || (r.data ?? []).length === 0).toBe(true)
  })
})

// ───────────────────────── BL-176 ─────────────────────────

describe('0072 BL-176: state, governing-law state and type are admin-only', () => {
  const read = async () => {
    const { data } = await adminDb().from('associations').select('name, state, governing_law_state, type').eq('id', org.associationId).single()
    return data as { name: string; state: string; governing_law_state: string | null; type: string }
  }
  const patch = (who: TestUser, body: Record<string, unknown>, id = org.associationId) =>
    who.client.from('associations').update(body as never).eq('id', id).select('id')

  it('denied: a board member’s PATCH of state, governing_law_state or type is refused via REST', async () => {
    for (const body of [{ state: 'GA' }, { governing_law_state: 'GA' }, { type: 'condo' }, { name: 'Renamed', state: 'GA' }]) {
      const r = await patch(board, body)
      expect(r.error?.code, JSON.stringify(Object.keys(body))).toBe('42501')
    }
    expect(await read()).toMatchObject({ state: 'FL', governing_law_state: null, type: 'hoa' })
    expect((await read()).name).not.toBe('Renamed')
  })

  it('allowed: a board member still edits every other column, and re-sends the same state', async () => {
    const r = await patch(board, { name: 'Maple HOA', state: 'FL', type: 'hoa' })
    expect(r.error).toBeNull()
    expect(r.data).toHaveLength(1)
    expect((await read()).name).toBe('Maple HOA')
    const r2 = await patch(board, { total_units: 42 })
    expect(r2.error).toBeNull()
  })

  it('allowed: an admin changes them; so does the service role', async () => {
    expect((await patch(admin, { state: 'GA', governing_law_state: 'GA', type: 'condo' })).error).toBeNull()
    expect(await read()).toMatchObject({ state: 'GA', governing_law_state: 'GA', type: 'condo' })
    const svc = await adminDb().from('associations').update({ state: 'CA', type: 'coop' }).eq('id', org.associationId)
    expect(svc.error).toBeNull()
    expect(await read()).toMatchObject({ state: 'CA', type: 'coop' })
  })

  it('cross-org: another org’s admin changes nothing here (the row is not theirs), and cannot move it', async () => {
    const r = await patch(otherAdmin, { state: 'TX' })
    expect(r.data ?? []).toHaveLength(0)
    expect(await read()).toMatchObject({ state: 'FL' })
    const moved = await patch(otherAdmin, { organization_id: other.orgId, state: 'TX' })
    expect(moved.data ?? []).toHaveLength(0)
    expect(await read()).toMatchObject({ state: 'FL' })
  })

  it('denied: a resident’s PATCH changes nothing', async () => {
    const r = await patch(resident, { state: 'TX' })
    expect(r.data ?? []).toHaveLength(0)
    expect(await read()).toMatchObject({ state: 'FL' })
  })

  it('the trigger is installed and the earlier dual-control guard is untouched', () => {
    const t = psqlRows<{ tgname: string }>(
      `select tgname from pg_trigger where tgrelid = 'public.associations'::regclass and not tgisinternal
          and tgname in ('associations_state_type_guard', 'associations_dual_control_guard') order by tgname`,
    )
    expect(t.map((x) => x.tgname)).toEqual(['associations_dual_control_guard', 'associations_state_type_guard'])
  })
})

// A reminder that a random id never matches a charge.
describe('0072 smoke', () => {
  it('an unknown charge id is refused cleanly', async () => {
    const r = await lump(board, { parts: [{ assessment_id: randomUUID(), cents: 100 }] })
    expect(r.error?.code).toBe('23503')
  })
})
