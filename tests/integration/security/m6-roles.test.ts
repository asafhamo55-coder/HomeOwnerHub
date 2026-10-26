/**
 * Migration 0070 (migrations/0070_m6_roles.sql, batch M6, BL-168
 * professional and officer roles) against real Postgres. CI only (no local
 * database).
 *
 * Role x table, three outcomes for every professional:
 *   allowed  an active grant reads exactly what the role is for;
 *   denied   everything else (other roles' tables, other orgs, unassigned
 *            matters, every write);
 *   expired  the same grant after access_expires_at: nothing at all.
 *
 * Also: the officer-title / expiry / general-counsel CHECKs, the 0058
 * widening (board writes resident, cpa, attorney rows only), matter
 * assignments (scope trigger, own-rows read), auth_org_ids() no longer
 * listing a professional, the two owner-data functions, the SECURITY
 * DEFINER helpers refusing a caller with no session, and dual control on
 * money approvals.
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds; every RLS assertion
 * about a user runs through that user's own client. Ids and counts only;
 * no PII. The new columns and tables are not in the generated Database
 * types until gen:types runs after prod has 0070 (CLAUDE.md footgun 3),
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
  mintUser,
  type AccountingRefs,
  type OrgFixture,
  type TestUser,
} from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

const FUTURE = new Date(Date.now() + 90 * 86_400_000).toISOString()
const PAST = new Date(Date.now() - 86_400_000).toISOString()

let org: OrgFixture
let other: OrgFixture
let acct: AccountingRefs
let board: TestUser
let board2: TestUser
let admin: TestUser
let resident: TestUser
let cpa: TestUser
let cpaExpired: TestUser
let attorney: TestUser
let attorneyExpired: TestUser
let attorneyOther: TestUser
let counsel: TestUser
let otherBoard: TestUser
let otherCpa: TestUser

const ids: Record<string, string> = {}

async function insertOne(t: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await adminDb().from(t as never).insert(row as never).select('id').single()
  if (error || !data) throw new Error(`seed ${t}: ${error?.code ?? 'no row'}`)
  return (data as { id: string }).id
}

async function rows(u: TestUser, table: string, col = 'id'): Promise<string[]> {
  const { data, error } = await u.client.from(table as never).select(col)
  if (error) throw new Error(`${table}: ${error.code}`)
  return ((data ?? []) as unknown as Array<Record<string, string>>).map((r) => r[col]!)
}

async function seedHome(f: OrgFixture): Promise<{ unit: string; prop: string }> {
  const suffix = randomUUID().slice(0, 8)
  const prop = await insertOne('hoa_properties', { org_id: f.orgId, address: `${suffix} Counsel Way` })
  const unit = await insertOne('units', {
    organization_id: f.orgId,
    association_id: f.associationId,
    address_line1: `${suffix} Counsel Way`,
    city: 'Atlanta',
    state: 'GA',
    postal_code: '30301',
    legacy_hoa_property_id: prop,
  })
  await insertOne('ownerships', {
    organization_id: f.orgId,
    unit_id: unit,
    owner_name: 'Test Owner',
    owner_email: 'owner@example.test',
    owner_phone: '555-0100',
    valid_from: '2024-01-01',
  })
  return { unit, prop }
}

async function assign(who: TestUser, type: string, matterId: string): Promise<void> {
  await insertOne('matter_assignments', { organization_id: org.orgId, user_id: who.id, matter_type: type, matter_id: matterId })
}

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  other = await makeOrg()
  acct = await makeAccounting(org)
  board = await mintUser(org, 'board', { officerTitle: 'treasurer' })
  board2 = await mintUser(org, 'board')
  admin = await mintUser(org, 'admin')
  resident = await mintUser(org, 'resident')
  cpa = await mintUser(org, 'cpa', { accessExpiresAt: FUTURE })
  cpaExpired = await mintUser(org, 'cpa', { accessExpiresAt: PAST })
  attorney = await mintUser(org, 'attorney', { accessExpiresAt: FUTURE })
  attorneyExpired = await mintUser(org, 'attorney', { accessExpiresAt: PAST })
  attorneyOther = await mintUser(org, 'attorney', { accessExpiresAt: FUTURE })
  counsel = await mintUser(org, 'attorney', { accessExpiresAt: FUTURE, generalCounsel: true })
  otherBoard = await mintUser(other, 'board')
  otherCpa = await mintUser(other, 'cpa', { accessExpiresAt: FUTURE })

  const base = { organization_id: org.orgId, association_id: org.associationId }
  const home = await seedHome(org)
  const home2 = await seedHome(org) // an unassigned home
  ids.unit = home.unit
  ids.unit2 = home2.unit

  // Accounting (shapes from accounting-rls.test.ts).
  const assessment = (unit: string) =>
    insertOne('assessments', {
      ...base,
      unit_id: unit,
      fiscal_period_id: acct.fiscalPeriodId,
      assessment_type: 'regular',
      amount: 300,
      due_date: '2026-01-01',
      status: 'open',
    })
  ids.assessment = await assessment(home.unit)
  ids.assessment2 = await assessment(home2.unit)
  ids.payment = await insertOne('payments', {
    organization_id: org.orgId,
    unit_id: home.unit,
    assessment_id: ids.assessment,
    amount: 100,
    payment_method: 'check',
    paid_at: '2026-01-05T00:00:00Z',
  })
  ids.payment2 = await insertOne('payments', {
    organization_id: org.orgId,
    unit_id: home2.unit,
    assessment_id: ids.assessment2,
    amount: 100,
    payment_method: 'check',
    paid_at: '2026-01-05T00:00:00Z',
  })
  ids.je = await insertOne('journal_entries', {
    ...base,
    fiscal_period_id: acct.fiscalPeriodId,
    entry_number: `JE-SEED-${randomUUID().slice(0, 6)}`,
    entry_date: '2026-01-02',
    memo: 'seed',
    source: 'manual',
    status: 'draft',
  })
  ids.ledger = await insertOne('ledger_entries', {
    organization_id: org.orgId,
    journal_entry_id: ids.je,
    account_id: acct.accountIds['1010'],
    fund_id: acct.fundIds.OPERATING,
    debit_amount: 10,
    credit_amount: 0,
  })
  ids.bankAccount = await insertOne('bank_accounts', { ...base, fund_id: acct.fundIds.OPERATING, account_name: 'Seed Checking' })
  ids.bankTxn = await insertOne('bank_transactions', {
    organization_id: org.orgId,
    bank_account_id: ids.bankAccount,
    amount: 300,
    posted_date: '2026-01-03',
    memo: 'seed deposit',
  })
  ids.bankRec = await insertOne('bank_reconciliations', {
    organization_id: org.orgId,
    bank_account_id: ids.bankAccount,
    statement_date: '2026-01-31',
  })
  ids.budget = await insertOne('budgets', { ...base, fiscal_period_id: acct.fiscalPeriodId, fund_id: acct.fundIds.OPERATING, status: 'draft' })
  ids.budgetLine = await insertOne('budget_line_items', { budget_id: ids.budget, account_id: acct.accountIds['5000'], amount: 1000 })
  ids.invoice = await insertOne('invoices', { ...base, invoice_number: 'INV-SEED', invoice_date: '2026-01-04', amount: 500, status: 'received' })
  ids.paymentPlan = await insertOne('payment_plans', {
    organization_id: org.orgId,
    unit_id: home.unit,
    total_amount: 300,
    installment_count: 3,
    installment_amount: 100,
    start_date: '2026-02-01',
    status: 'proposed',
  })
  ids.paymentMethod = await insertOne('payment_methods', {
    organization_id: org.orgId,
    unit_id: home.unit,
    user_id: resident.id,
    method_type: 'ach',
    last4: '1234',
  })

  // Matters.
  ids.case = await insertOne('collection_cases', { ...base, unit_id: home.unit })
  ids.case2 = await insertOne('collection_cases', { ...base, unit_id: home2.unit })
  ids.caseEvent = await insertOne('collection_events', {
    organization_id: org.orgId,
    collection_case_id: ids.case,
    event_type: 'note',
    occurred_on: '2026-02-01',
  })
  ids.caseEvent2 = await insertOne('collection_events', {
    organization_id: org.orgId,
    collection_case_id: ids.case2,
    event_type: 'note',
    occurred_on: '2026-02-01',
  })
  ids.violation = await insertOne('hoa_violations', { org_id: org.orgId, property_id: home.prop, violation_type: 'trash', description: 'bins', status: 'notice_sent' })
  ids.violation2 = await insertOne('hoa_violations', { org_id: org.orgId, property_id: home2.prop, violation_type: 'trash', description: 'bins', status: 'notice_sent' })
  ids.hearing = await insertOne('violation_hearings', { organization_id: org.orgId, violation_id: ids.violation, status: 'requested' })
  ids.hearing2 = await insertOne('violation_hearings', { organization_id: org.orgId, violation_id: ids.violation2, status: 'requested' })
  const ticket = (unit: string, category: string) =>
    insertOne('tickets', {
      ...base,
      unit_id: unit,
      submitted_by: resident.id,
      subject: 'Records',
      category,
      description: 'x',
    })
  ids.records = await ticket(home.unit, 'records_request')
  ids.records2 = await ticket(home2.unit, 'records_request')
  ids.maintenance = await ticket(home.unit, 'maintenance')
  ids.govDoc = await insertOne('governing_documents', { organization_id: org.orgId, type: 'bylaws', title: 'Bylaws' })
  ids.done = await insertOne('compliance_deadlines_done', { ...base, code: 'annual-report' })

  // Assignments: attorney + attorneyExpired hold the first of each matter.
  for (const who of [attorney, attorneyExpired]) {
    await assign(who, 'collections_case', ids.case!)
    await assign(who, 'violation', ids.violation!)
    await assign(who, 'records_request', ids.records!)
  }
})

const CPA_TABLES = [
  ['funds', 'funds'],
  ['chart_of_accounts', 'accounts'],
  ['fiscal_periods', 'period'],
  ['journal_entries', 'je'],
  ['ledger_entries', 'ledger'],
  ['budgets', 'budget'],
  ['budget_line_items', 'budgetLine'],
  ['bank_accounts', 'bankAccount'],
  ['bank_transactions', 'bankTxn'],
  ['bank_reconciliations', 'bankRec'],
  ['assessments', 'assessment'],
  ['payments', 'payment'],
  ['invoices', 'invoice'],
  ['payment_plans', 'paymentPlan'],
] as const

describe('0070 CPA: read-only accounting', () => {
  it.each(CPA_TABLES)('allowed: an active CPA reads %s of their org, and only that org', async (table) => {
    const mine = await rows(cpa, table)
    expect(mine.length).toBeGreaterThan(0)
    const { data: all } = await adminDb().from(table as never).select('id').eq('organization_id' as never, org.orgId)
    // Every row of the org that board reads, the CPA reads.
    if (table !== 'budget_line_items') expect(mine.length).toBe((all ?? []).length)
    // The other org's CPA reads none of this org's rows.
    const theirs = await rows(otherCpa, table)
    for (const id of theirs) expect(mine).not.toContain(id)
  })

  it.each(CPA_TABLES)('expired: an expired CPA reads nothing from %s', async (table) => {
    expect(await rows(cpaExpired, table)).toEqual([])
  })

  it.each(CPA_TABLES)('denied: an attorney (even general counsel) reads nothing from %s beyond assigned units', async (table) => {
    const got = await rows(counsel, table)
    expect(got).toEqual([])
  })

  it('denied: a CPA never writes (insert, update, delete) on a table it reads', async () => {
    const ins = await cpa.client.from('journal_entries' as never).insert({
      organization_id: org.orgId,
      association_id: org.associationId,
      fiscal_period_id: acct.fiscalPeriodId,
      entry_number: 'JE-CPA',
      entry_date: '2026-03-01',
      memo: 'x',
      source: 'manual',
      status: 'draft',
    } as never)
    expect(ins.error?.code).toBe('42501')
    const upd = await cpa.client.from('assessments').update({ amount: 1 } as never).eq('id', ids.assessment!).select('id')
    expect(upd.data ?? []).toHaveLength(0)
    const del = await cpa.client.from('invoices').delete().eq('id', ids.invoice!).select('id')
    expect(del.data ?? []).toHaveLength(0)
    const closing = await cpa.client.from('fiscal_periods').update({ status: 'closed' } as never).eq('id', acct.fiscalPeriodId).select('id')
    expect(closing.data ?? []).toHaveLength(0)
    const { data: still } = await adminDb().from('assessments').select('amount').eq('id', ids.assessment!).single()
    expect(Number(still?.amount)).toBe(300)
  })

  it('denied: a CPA reads no payment methods, no ticket, no violation, no case, no document', async () => {
    for (const t of ['payment_methods', 'tickets', 'hoa_violations', 'collection_cases', 'collection_events', 'violation_hearings', 'governing_documents', 'compliance_deadlines_done', 'hoa_properties', 'ownerships', 'units']) {
      expect(await rows(cpa, t)).toEqual([])
    }
  })

  it('owner names only: cpa_owner_names gives unit and name, refuses an expired or foreign caller', async () => {
    const { data, error } = await cpa.client.rpc('cpa_owner_names' as never, { p_org_id: org.orgId } as never)
    expect(error).toBeNull()
    expect(Object.keys((data as Array<Record<string, unknown>>)[0]!).sort()).toEqual(['owner_name', 'unit_id'])
    expect((data as unknown[]).length).toBe(2)
    for (const u of [cpaExpired, attorney, otherCpa, resident, board]) {
      const r = await u.client.rpc('cpa_owner_names' as never, { p_org_id: org.orgId } as never)
      expect(r.error?.code).toBe('42501')
    }
  })
})

describe('0070 attorney: assigned matters only', () => {
  it('allowed: the assigned case, its events, the violation, its hearing and the records request', async () => {
    expect(await rows(attorney, 'collection_cases')).toEqual([ids.case])
    expect(await rows(attorney, 'collection_events')).toEqual([ids.caseEvent])
    expect(await rows(attorney, 'hoa_violations')).toEqual([ids.violation])
    expect(await rows(attorney, 'violation_hearings')).toEqual([ids.hearing])
    expect(await rows(attorney, 'tickets')).toEqual([ids.records])
  })

  it('allowed: the unit ledger of an assigned unit, no other unit', async () => {
    expect(await rows(attorney, 'assessments')).toEqual([ids.assessment])
    expect(await rows(attorney, 'payments')).toEqual([ids.payment])
  })

  it('denied: an attorney with no assignment reads no matter and no ledger', async () => {
    for (const t of ['collection_cases', 'collection_events', 'hoa_violations', 'violation_hearings', 'tickets', 'assessments', 'payments']) {
      expect(await rows(attorneyOther, t)).toEqual([])
    }
  })

  it('denied: an attorney reads no accounting table, document, roster or member list', async () => {
    for (const t of CPA_TABLES.filter(([t]) => t !== 'assessments' && t !== 'payments').map(([t]) => t)) {
      expect(await rows(attorney, t)).toEqual([])
    }
    for (const t of ['payment_methods', 'governing_documents', 'compliance_deadlines_done', 'ownerships', 'units', 'hoa_properties']) {
      expect(await rows(attorney, t)).toEqual([])
    }
    // Co-members' rows are not listed: only their own.
    expect(await rows(attorney, 'org_members', 'user_id')).toEqual([attorney.id])
  })

  it('expired: the same assignments read nothing', async () => {
    for (const t of ['collection_cases', 'collection_events', 'hoa_violations', 'violation_hearings', 'tickets', 'assessments', 'payments', 'matter_assignments']) {
      expect(await rows(attorneyExpired, t)).toEqual([])
    }
  })

  it('denied: an attorney never writes a matter', async () => {
    const upd = await attorney.client.from('collection_cases').update({ status: 'resolved' } as never).eq('id', ids.case!).select('id')
    expect(upd.data ?? []).toHaveLength(0)
    const ev = await attorney.client.from('collection_events').insert({
      organization_id: org.orgId,
      collection_case_id: ids.case,
      event_type: 'note',
      occurred_on: '2026-03-01',
    } as never)
    expect(ev.error?.code).toBe('42501')
    const vio = await attorney.client.from('hoa_violations').update({ status: 'resolved' } as never).eq('id', ids.violation!).select('id')
    expect(vio.data ?? []).toHaveLength(0)
    const asg = await attorney.client.from('matter_assignments' as never).insert({
      organization_id: org.orgId,
      user_id: attorney.id,
      matter_type: 'collections_case',
      matter_id: ids.case2,
    } as never)
    expect(asg.error?.code).toBe('42501')
  })

  it('general counsel reads the governing documents and the compliance record; others do not', async () => {
    expect(await rows(counsel, 'governing_documents')).toEqual([ids.govDoc])
    expect(await rows(counsel, 'compliance_deadlines_done')).toEqual([ids.done])
    expect(await rows(attorney, 'governing_documents')).toEqual([])
    expect(await rows(cpa, 'governing_documents')).toEqual([])
  })

  it('owner name and address of an assigned matter only, never contact details', async () => {
    const { data, error } = await attorney.client.rpc('attorney_matter_party' as never, {
      p_org_id: org.orgId,
      p_matter_type: 'collections_case',
      p_matter_id: ids.case,
    } as never)
    expect(error).toBeNull()
    const row = (data as Array<Record<string, unknown>>)[0]!
    expect(Object.keys(row).sort()).toEqual(['address_line1', 'address_line2', 'city', 'owner_name', 'postal_code', 'state'])
    expect(row.owner_name).toBe('Test Owner')
    const unassigned = await attorney.client.rpc('attorney_matter_party' as never, {
      p_org_id: org.orgId,
      p_matter_type: 'collections_case',
      p_matter_id: ids.case2,
    } as never)
    expect(unassigned.error?.code).toBe('42501')
    const expired = await attorneyExpired.client.rpc('attorney_matter_party' as never, {
      p_org_id: org.orgId,
      p_matter_type: 'collections_case',
      p_matter_id: ids.case,
    } as never)
    expect(expired.error?.code).toBe('42501')
  })
})

describe('0070 professionals and the rest of the org', () => {
  it('a professional is not a member: auth_org_ids() omits them, member-read tables stay shut', async () => {
    for (const u of [cpa, attorney, counsel]) {
      const { data } = await u.client.rpc('auth_org_ids' as never)
      expect(data).toEqual([])
    }
    const { data: boardOrgs } = await board.client.rpc('auth_org_ids' as never)
    expect(boardOrgs).toEqual([org.orgId])
    // Member-read tables (0063): recurring events, templates.
    for (const t of ['hoa_recurring_events', 'communications', 'communication_threads', 'hoa_meeting_minutes', 'ai_runs', 'audit_log']) {
      expect(await rows(cpa, t)).toEqual([])
      expect(await rows(attorney, t)).toEqual([])
    }
  })

  it('both read their org and association while active; an expired CPA reads the org name only', async () => {
    expect(await rows(cpa, 'orgs')).toEqual([org.orgId])
    expect(await rows(cpa, 'associations')).toEqual([org.associationId])
    expect(await rows(attorney, 'orgs')).toEqual([org.orgId])
    expect(await rows(cpaExpired, 'orgs')).toEqual([org.orgId])
    expect(await rows(cpaExpired, 'associations')).toEqual([])
  })

  it('a professional reads their own proposals and nobody else’s; expired reads none', async () => {
    const mine = await insertOne('approval_requests', {
      organization_id: org.orgId,
      workflow_id: 'professionals',
      action_type: 'pro.note',
      subject_type: 'pro_item',
      subject_id: randomUUID(),
      payload: { v: 1 },
      summary: 'A note',
      proposed_by: cpa.id,
    })
    await insertOne('approval_requests', {
      organization_id: org.orgId,
      workflow_id: 'professionals',
      action_type: 'pro.note',
      subject_type: 'pro_item',
      subject_id: randomUUID(),
      payload: { v: 1 },
      summary: 'Another note',
      proposed_by: attorney.id,
    })
    expect(await rows(cpa, 'approval_requests')).toEqual([mine])
    expect(await rows(cpaExpired, 'approval_requests')).toEqual([])
    expect(await rows(resident, 'approval_requests')).toEqual([])
    expect((await rows(board, 'approval_requests')).length).toBe(2)
    const ins = await cpa.client.from('approval_requests' as never).insert({
      organization_id: org.orgId,
      workflow_id: 'professionals',
      action_type: 'pro.note',
      subject_type: 'pro_item',
      subject_id: randomUUID(),
      payload: {},
      summary: 'direct',
      proposed_by: cpa.id,
    } as never)
    expect(ins.error?.code).toBe('42501')
  })

  it('an attorney reads the collections letters of their case only', async () => {
    const letter = (caseId: string) =>
      insertOne('approval_requests', {
        organization_id: org.orgId,
        workflow_id: 'collections_letters',
        action_type: 'collections.letter',
        subject_type: 'collections_letter',
        subject_id: randomUUID(),
        payload: { caseId },
        summary: 'Letter',
      })
    const mine = await letter(ids.case!)
    await letter(ids.case2!)
    expect(await rows(attorney, 'approval_requests')).toEqual([mine])
    expect(await rows(attorneyExpired, 'approval_requests')).toEqual([])
    expect(await rows(attorneyOther, 'approval_requests')).toEqual([])
  })

  it('every helper refuses a caller with no session (anon), whatever the grants say', async () => {
    const anon = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const calls: Array<[string, Record<string, unknown>]> = [
      ['auth_pro_active', { p_org_id: org.orgId }],
      ['auth_has_pro_membership', { p_org_id: org.orgId }],
      ['auth_attorney_has_matter', { p_org_id: org.orgId, p_matter_type: 'violation', p_matter_id: ids.violation }],
      ['auth_attorney_matter_ids', { p_matter_type: 'violation' }],
      ['auth_attorney_unit_ids', {}],
      ['auth_pro_org_ids', {}],
      ['auth_counsel_org_ids', {}],
      ['cpa_owner_names', { p_org_id: org.orgId }],
      ['attorney_matter_party', { p_org_id: org.orgId, p_matter_type: 'violation', p_matter_id: ids.violation }],
      ['record_approval_signoff', { p_request_id: randomUUID() }],
    ]
    for (const [fn, args] of calls) {
      const r = await anon.rpc(fn as never, args as never)
      expect(r.error, fn).not.toBeNull()
      expect(r.data, fn).toBeNull()
    }
  })
})

describe('0070 org_members: titles, expiry, who writes which row', () => {
  const insertMember = (client: TestUser['client'], user: string, extra: Record<string, unknown>) =>
    client.from('org_members').insert({ org_id: org.orgId, user_id: user, ...extra } as never)

  it('CHECKs: a professional needs an expiry; a title is for board members; general counsel is for attorneys', async () => {
    const u1 = await mintUser(org, 'resident')
    await adminDb().from('org_members').delete().eq('user_id', u1.id)
    const noExpiry = await adminDb().from('org_members').insert({ org_id: org.orgId, user_id: u1.id, role: 'cpa' } as never)
    expect(noExpiry.error?.code).toBe('23514')
    const titleOnCpa = await adminDb().from('org_members').insert({ org_id: org.orgId, user_id: u1.id, role: 'cpa', access_expires_at: FUTURE, officer_title: 'treasurer' } as never)
    expect(titleOnCpa.error?.code).toBe('23514')
    const badTitle = await adminDb().from('org_members').update({ officer_title: 'chairman' } as never).eq('user_id', board.id)
    expect(badTitle.error?.code).toBe('23514')
    const gcOnCpa = await adminDb().from('org_members').insert({ org_id: org.orgId, user_id: u1.id, role: 'cpa', access_expires_at: FUTURE, general_counsel: true } as never)
    expect(gcOnCpa.error?.code).toBe('23514')
    const badRole = await adminDb().from('org_members').insert({ org_id: org.orgId, user_id: u1.id, role: 'auditor', access_expires_at: FUTURE } as never)
    expect(badRole.error?.code).toBe('23514')
    for (const title of ['president', 'vice_president', 'secretary', 'treasurer', 'director']) {
      const ok = await adminDb().from('org_members').update({ officer_title: title } as never).eq('user_id', board2.id)
      expect(ok.error, title).toBeNull()
    }
  })

  it('board invites residents and professionals but not board or admin; admin sets officer titles; board does not', async () => {
    const a = await mintUser(other, 'resident')
    const b = await mintUser(other, 'resident')
    const c = await mintUser(other, 'resident')
    for (const u of [a, b, c]) await adminDb().from('org_members').delete().eq('user_id', u.id)
    expect((await insertMember(board.client, a.id, { role: 'cpa', access_expires_at: FUTURE })).error).toBeNull()
    expect((await insertMember(board.client, b.id, { role: 'attorney', access_expires_at: FUTURE })).error).toBeNull()
    expect((await insertMember(board.client, c.id, { role: 'board' })).error?.code).toBe('42501')
    expect((await insertMember(board.client, c.id, { role: 'admin' })).error?.code).toBe('42501')
    expect((await insertMember(resident.client, c.id, { role: 'cpa', access_expires_at: FUTURE })).error?.code).toBe('42501')
    expect((await insertMember(cpa.client, c.id, { role: 'resident' })).error?.code).toBe('42501')

    const titleByBoard = await board.client.from('org_members').update({ officer_title: 'secretary' } as never).eq('user_id', board2.id).select('user_id')
    expect(titleByBoard.data ?? []).toHaveLength(0)
    const titleByAdmin = await admin.client.from('org_members').update({ officer_title: 'secretary' } as never).eq('user_id', board2.id).select('user_id')
    expect(titleByAdmin.error).toBeNull()
    expect(titleByAdmin.data ?? []).toHaveLength(1)

    // Renew and revoke a professional: board may.
    const renew = await board.client.from('org_members').update({ access_expires_at: FUTURE } as never).eq('user_id', cpaExpired.id).select('user_id')
    expect(renew.data ?? []).toHaveLength(1)
    const revoke = await board.client.from('org_members').delete().eq('user_id', attorneyOther.id).select('user_id')
    expect(revoke.data ?? []).toHaveLength(1)
  })

  it('a professional edits nothing of their own grant', async () => {
    const ext = await cpa.client.from('org_members').update({ access_expires_at: '2099-01-01T00:00:00Z' } as never).eq('user_id', cpa.id).select('user_id')
    expect(ext.data ?? []).toHaveLength(0)
    const promote = await cpa.client.from('org_members').update({ role: 'admin' } as never).eq('user_id', cpa.id).select('user_id')
    expect(promote.data ?? []).toHaveLength(0)
    const del = await cpa.client.from('org_members').delete().eq('user_id', cpa.id).select('user_id')
    expect(del.data ?? []).toHaveLength(0)
    expect(await rows(cpa, 'org_members', 'user_id')).toEqual([cpa.id])
  })
})

describe('0070 matter_assignments', () => {
  it('board and admin assign and revoke; created_by is the caller; an attorney reads only their own live rows', async () => {
    const ins = await board.client.from('matter_assignments' as never).insert({
      organization_id: org.orgId,
      user_id: attorneyOther.id,
      matter_type: 'collections_case',
      matter_id: ids.case2,
      created_by: admin.id,
    } as never)
    expect(ins.error).toBeNull()
    const { data } = await adminDb().from('matter_assignments' as never).select('created_by').eq('user_id' as never, attorneyOther.id)
    expect(data).toEqual([{ created_by: board.id }])
    expect(await rows(attorneyOther, 'collection_cases')).toEqual([ids.case2])
    expect((await rows(attorneyOther, 'matter_assignments')).length).toBe(1)

    const revoke = await admin.client.from('matter_assignments' as never).update({ revoked_at: new Date().toISOString() } as never).eq('user_id' as never, attorneyOther.id).select('id')
    expect(revoke.data ?? []).toHaveLength(1)
    expect(await rows(attorneyOther, 'collection_cases')).toEqual([])
    expect(await rows(attorneyOther, 'matter_assignments')).toEqual([])
  })

  it('a CPA, a resident and another org’s board cannot assign or read', async () => {
    const row = { organization_id: org.orgId, user_id: attorneyOther.id, matter_type: 'violation', matter_id: ids.violation2 }
    for (const u of [cpa, resident, otherBoard]) {
      expect((await u.client.from('matter_assignments' as never).insert(row as never)).error?.code).toBe('42501')
      expect(await rows(u, 'matter_assignments')).toEqual([])
    }
  })

  it('the person must be an attorney of the org and the matter the org’s (23503, also for the service role)', async () => {
    const notAttorney = await adminDb().from('matter_assignments' as never).insert({ organization_id: org.orgId, user_id: cpa.id, matter_type: 'violation', matter_id: ids.violation2 } as never)
    expect(notAttorney.error?.code).toBe('23503')
    const foreignCase = await insertOne('collection_cases', { organization_id: other.orgId, association_id: other.associationId, unit_id: (await seedHome(other)).unit })
    const wrongOrg = await adminDb().from('matter_assignments' as never).insert({ organization_id: org.orgId, user_id: attorneyOther.id, matter_type: 'collections_case', matter_id: foreignCase } as never)
    expect(wrongOrg.error?.code).toBe('23503')
    const notRecords = await adminDb().from('matter_assignments' as never).insert({ organization_id: org.orgId, user_id: attorneyOther.id, matter_type: 'records_request', matter_id: ids.maintenance } as never)
    expect(notRecords.error?.code).toBe('23503')
  })

  it('one live assignment per person and matter (23505)', async () => {
    const dup = await adminDb().from('matter_assignments' as never).insert({ organization_id: org.orgId, user_id: attorney.id, matter_type: 'violation', matter_id: ids.violation } as never)
    expect(dup.error?.code).toBe('23505')
  })
})

describe('0070 dual control and sign-offs', () => {
  const money = (extra: Record<string, unknown> = {}) => ({
    organization_id: org.orgId,
    workflow_id: 'professionals',
    action_type: 'pro.journal_entry',
    subject_type: 'pro_item',
    subject_id: randomUUID(),
    payload: { v: 1 },
    summary: 'Adjusting entry',
    amount: 5000,
    proposed_by: cpa.id,
    ...extra,
  })

  it('without a threshold nothing changes: one decision approves', async () => {
    const id = await insertOne('approval_requests', money())
    const r = await board.client.rpc('decide_approval_request' as never, { p_id: id, p_decision: 'approve' } as never)
    expect(r.error).toBeNull()
  })

  it('above the board’s amount, approval needs two different board/admin sign-offs (23514)', async () => {
    await adminDb().from('associations').update({ dual_control_cents: 100_000 } as never).eq('id', org.associationId)
    const id = await insertOne('approval_requests', money({ amount: 1500.5 }))

    const none = await board.client.rpc('decide_approval_request' as never, { p_id: id, p_decision: 'approve' } as never)
    expect(none.error?.code).toBe('23514')

    const first = await board.client.rpc('record_approval_signoff' as never, { p_request_id: id } as never)
    expect(first.data).toBe(1)
    const again = await board.client.rpc('record_approval_signoff' as never, { p_request_id: id } as never)
    expect(again.data).toBe(1)
    const one = await board.client.rpc('decide_approval_request' as never, { p_id: id, p_decision: 'approve' } as never)
    expect(one.error?.code).toBe('23514')

    const second = await board2.client.rpc('record_approval_signoff' as never, { p_request_id: id } as never)
    expect(second.data).toBe(2)
    const both = await board.client.rpc('decide_approval_request' as never, { p_id: id, p_decision: 'approve' } as never)
    expect(both.error).toBeNull()
  })

  it('at or below the amount, and for non-money items, one decision is enough', async () => {
    await adminDb().from('associations').update({ dual_control_cents: 100_000 } as never).eq('id', org.associationId)
    const small = await insertOne('approval_requests', money({ amount: 1000 }))
    expect((await board.client.rpc('decide_approval_request' as never, { p_id: small, p_decision: 'approve' } as never)).error).toBeNull()
    const note = await insertOne('approval_requests', money({ action_type: 'pro.note', amount: 999_999 }))
    expect((await board.client.rpc('decide_approval_request' as never, { p_id: note, p_decision: 'approve' } as never)).error).toBeNull()
  })

  it('only board/admin of the request’s org sign off; a professional or another org cannot; sign-offs are board-readable only', async () => {
    const id = await insertOne('approval_requests', money())
    for (const u of [cpa, attorney, resident, otherBoard]) {
      const r = await u.client.rpc('record_approval_signoff' as never, { p_request_id: id } as never)
      expect(r.error?.code).toBe('42501')
    }
    await board.client.rpc('record_approval_signoff' as never, { p_request_id: id } as never)
    expect(await rows(board, 'approval_signoffs')).toHaveLength(1)
    expect(await rows(admin, 'approval_signoffs')).toHaveLength(1)
    for (const u of [cpa, resident, otherBoard]) expect(await rows(u, 'approval_signoffs')).toEqual([])
    const direct = await board.client.from('approval_signoffs' as never).insert({ organization_id: org.orgId, approval_request_id: id, signer_id: board2.id } as never)
    expect(direct.error?.code).toBe('42501')
  })
})
