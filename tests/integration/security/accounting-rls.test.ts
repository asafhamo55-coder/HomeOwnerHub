/**
 * Accounting RLS (0061).
 *
 * Before 0061 every money table carried migration 0006's single
 *
 *   CREATE POLICY org_access ON public.<table>
 *     USING (organization_id = ANY (public.auth_org_ids()));
 *
 * a FOR ALL policy gated on org membership alone. With no WITH CHECK, the
 * USING expression also gates INSERT and UPDATE, so ANY member of the org,
 * a plain resident included, could post journal entries, mark their own
 * assessment paid, invent payments, or read the org's Plaid access tokens
 * straight through the anon key + their session. Only application code
 * stood in the way, and the accounting server actions did not check role.
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds and observes; every
 * authorization assertion goes through a real user JWT client. An UPDATE
 * or DELETE that RLS filters out returns no error and touches zero rows,
 * so every write negative re-reads the row as service role.
 */
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { postJournalEntry } from '../../../packages/db/src/accounting/post-journal-entry'
import {
  adminDb,
  makeAccounting,
  makeOrg,
  makeUnit,
  mintUser,
  type AccountingRefs,
  type Db,
  type OrgFixture,
  type TestUser,
} from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

// ─── world ──────────────────────────────────────────────────────────

interface World {
  org: OrgFixture
  acct: AccountingRefs
  resident: TestUser
  /** Linked to a unit only through property_residents (email), no ownership. */
  emailResident: TestUser
  board: TestUser
  admin: TestUser
  /** Board member of a DIFFERENT org. */
  foreignBoard: TestUser
  unitMine: string
  unitNeighbor: string
  unitByEmail: string
  ids: Record<string, string>
}

async function one<T extends { id: string }>(
  p: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  label: string,
): Promise<string> {
  const { data, error } = await p
  if (error || !data) throw new Error(`seed ${label}: ${error?.message}`)
  return data.id
}

async function seedWorld(): Promise<World> {
  const db = adminDb()
  const org = await makeOrg()
  const acct = await makeAccounting(org)
  const unitMine = await makeUnit(org)
  const unitNeighbor = await makeUnit(org)

  const resident = await mintUser(org, 'resident')
  const emailResident = await mintUser(org, 'resident')
  const board = await mintUser(org, 'board')
  const admin = await mintUser(org, 'admin')
  const otherOrg = await makeOrg()
  const foreignBoard = await mintUser(otherOrg, 'board')

  // Resident owns unitMine (the primary lookup in lib/resident.ts).
  await one(
    db
      .from('ownerships')
      .insert({
        organization_id: org.orgId,
        unit_id: unitMine,
        owner_user_id: resident.id,
        valid_from: '2024-01-01',
      })
      .select('id')
      .single(),
    'ownership',
  )

  // emailResident reaches a unit only through the property_residents email
  // fallback: property_residents.email -> hoa_properties -> units.legacy_hoa_property_id.
  const propertyId = await one(
    db
      .from('hoa_properties')
      .insert({ org_id: org.orgId, address: `${randomUUID().slice(0, 6)} Email Way` })
      .select('id')
      .single(),
    'hoa_property',
  )
  await one(
    db
      .from('property_residents')
      .insert({
        organization_id: org.orgId,
        property_id: propertyId,
        full_name: 'Email Resident',
        // Different case on purpose: the app matches with ilike.
        email: emailResident.email.toUpperCase(),
        role: 'owner',
      })
      .select('id')
      .single(),
    'property_resident',
  )
  const unitByEmail = await one(
    db
      .from('units')
      .insert({
        organization_id: org.orgId,
        association_id: org.associationId,
        address_line1: 'Email Way',
        legacy_hoa_property_id: propertyId,
      })
      .select('id')
      .single(),
    'unit by email',
  )

  const base = { organization_id: org.orgId, association_id: org.associationId }
  const assessment = (unit_id: string) =>
    db
      .from('assessments')
      .insert({
        ...base,
        unit_id,
        fiscal_period_id: acct.fiscalPeriodId,
        assessment_type: 'regular',
        amount: 300,
        due_date: '2026-01-01',
        status: 'open',
      })
      .select('id')
      .single()

  const ids: Record<string, string> = {}
  ids.assessmentMine = await one(assessment(unitMine), 'assessment mine')
  ids.assessmentNeighbor = await one(assessment(unitNeighbor), 'assessment neighbor')
  ids.assessmentByEmail = await one(assessment(unitByEmail), 'assessment by email')

  ids.je = await one(
    db
      .from('journal_entries')
      .insert({
        ...base,
        fiscal_period_id: acct.fiscalPeriodId,
        entry_number: `JE-SEED-${randomUUID().slice(0, 6)}`,
        entry_date: '2026-01-02',
        memo: 'seed',
        source: 'manual',
        status: 'draft',
      })
      .select('id')
      .single(),
    'je',
  )
  ids.ledger = await one(
    db
      .from('ledger_entries')
      .insert({
        organization_id: org.orgId,
        journal_entry_id: ids.je,
        account_id: acct.accountIds['1010'],
        fund_id: acct.fundIds.OPERATING,
        debit_amount: 10,
        credit_amount: 0,
      })
      .select('id')
      .single(),
    'ledger',
  )

  const payment = (unit_id: string, assessment_id: string) =>
    db
      .from('payments')
      .insert({
        organization_id: org.orgId,
        unit_id,
        assessment_id,
        amount: 100,
        payment_method: 'check',
        paid_at: '2026-01-05T00:00:00Z',
      })
      .select('id')
      .single()
  ids.paymentMine = await one(payment(unitMine, ids.assessmentMine), 'payment mine')
  ids.paymentNeighbor = await one(payment(unitNeighbor, ids.assessmentNeighbor), 'payment neighbor')
  ids.paymentByEmail = await one(payment(unitByEmail, ids.assessmentByEmail), 'payment by email')

  ids.bankAccount = await one(
    db
      .from('bank_accounts')
      .insert({ ...base, fund_id: acct.fundIds.OPERATING, account_name: 'Seed Checking' })
      .select('id')
      .single(),
    'bank account',
  )
  ids.bankTxn = await one(
    db
      .from('bank_transactions')
      .insert({
        organization_id: org.orgId,
        bank_account_id: ids.bankAccount,
        amount: 300,
        posted_date: '2026-01-03',
        memo: 'seed deposit',
      })
      .select('id')
      .single(),
    'bank txn',
  )
  ids.bankRec = await one(
    db
      .from('bank_reconciliations')
      .insert({ organization_id: org.orgId, bank_account_id: ids.bankAccount, statement_date: '2026-01-31' })
      .select('id')
      .single(),
    'bank rec',
  )
  ids.budget = await one(
    db
      .from('budgets')
      .insert({ ...base, fiscal_period_id: acct.fiscalPeriodId, fund_id: acct.fundIds.OPERATING, status: 'draft' })
      .select('id')
      .single(),
    'budget',
  )
  ids.budgetLine = await one(
    db
      .from('budget_line_items')
      .insert({ budget_id: ids.budget, account_id: acct.accountIds['5000'], amount: 1000 })
      .select('id')
      .single(),
    'budget line',
  )
  ids.invoice = await one(
    db
      .from('invoices')
      .insert({ ...base, invoice_number: 'INV-SEED', invoice_date: '2026-01-04', amount: 500, status: 'received' })
      .select('id')
      .single(),
    'invoice',
  )
  ids.paymentPlan = await one(
    db
      .from('payment_plans')
      .insert({
        organization_id: org.orgId,
        unit_id: unitMine,
        total_amount: 300,
        installment_count: 3,
        installment_amount: 100,
        start_date: '2026-02-01',
        status: 'proposed',
      })
      .select('id')
      .single(),
    'payment plan',
  )
  ids.paymentMethod = await one(
    db
      .from('payment_methods')
      .insert({ organization_id: org.orgId, unit_id: unitMine, user_id: resident.id, method_type: 'ach', last4: '1234' })
      .select('id')
      .single(),
    'payment method',
  )
  ids.zelle = await one(
    db
      .from('zelle_inbound_matches')
      .insert({ organization_id: org.orgId, bank_transaction_id: ids.bankTxn, memo_code: 'SEED', status: 'unmatched' })
      .select('id')
      .single(),
    'zelle match',
  )
  ids.recurring = await one(
    db
      .from('recurring_journal_entries')
      .insert({ ...base, template_je_id: ids.je, cadence: 'monthly', next_run_date: '2026-02-01' })
      .select('id')
      .single(),
    'recurring je',
  )
  ids.adjusting = await one(
    db.from('adjusting_entries').insert({ journal_entry_id: ids.je, reason: 'seed' }).select('id').single(),
    'adjusting entry',
  )
  ids.closing = await one(
    db
      .from('closing_entries')
      .insert({ fiscal_period_id: acct.fiscalPeriodId, journal_entry_id: ids.je, closing_type: 'income_to_equity' })
      .select('id')
      .single(),
    'closing entry',
  )
  ids.plaidItem = await one(
    db
      .from('plaid_items' as never)
      .insert({ ...base, plaid_item_id: `item-${randomUUID()}`, access_token: 'access-sandbox-SECRET' } as never)
      .select('id')
      .single() as unknown as PromiseLike<{ data: { id: string } | null; error: { message: string } | null }>,
    'plaid item',
  )
  ids.hoaDues = await one(
    db
      .from('hoa_dues')
      .insert({ org_id: org.orgId, property_id: propertyId, period: '2026-01', amount_due: 300, due_date: '2026-01-01' })
      .select('id')
      .single(),
    'hoa dues',
  )

  // Unreferenced rows for the DELETE matrix.
  ids.jeSpare = await one(
    db
      .from('journal_entries')
      .insert({
        ...base,
        fiscal_period_id: acct.fiscalPeriodId,
        entry_number: `JE-SPARE-${randomUUID().slice(0, 6)}`,
        entry_date: '2026-01-02',
        memo: 'spare',
        source: 'manual',
        status: 'draft',
      })
      .select('id')
      .single(),
    'je spare',
  )
  ids.assessmentSpare = await one(assessment(unitNeighbor), 'assessment spare')
  ids.bankAccountSpare = await one(
    db
      .from('bank_accounts')
      .insert({ ...base, fund_id: acct.fundIds.OPERATING, account_name: 'Spare Checking' })
      .select('id')
      .single(),
    'bank account spare',
  )
  ids.bankTxnSpare = await one(
    db
      .from('bank_transactions')
      .insert({ organization_id: org.orgId, bank_account_id: ids.bankAccount, amount: 5, posted_date: '2026-01-03' })
      .select('id')
      .single(),
    'bank txn spare',
  )
  ids.fundSpare = await one(
    db.from('funds').insert({ ...base, code: 'SPARE', name: 'Spare', fund_type: 'capex' }).select('id').single(),
    'fund spare',
  )
  ids.coaSpare = await one(
    db
      .from('chart_of_accounts')
      .insert({ ...base, account_number: '9990', account_name: 'Spare', account_type: 'expense' })
      .select('id')
      .single(),
    'coa spare',
  )
  ids.periodSpare = await one(
    db.from('fiscal_periods').insert({ ...base, start_date: '2029-01-01', end_date: '2029-12-31' }).select('id').single(),
    'period spare',
  )
  ids.budgetSpare = await one(
    db
      .from('budgets')
      .insert({ ...base, fiscal_period_id: acct.fiscalPeriodId, fund_id: acct.fundIds.RESERVE, status: 'archived' })
      .select('id')
      .single(),
    'budget spare',
  )

  return {
    org,
    acct,
    resident,
    emailResident,
    board,
    admin,
    foreignBoard,
    unitMine,
    unitNeighbor,
    unitByEmail,
    ids,
  }
}

// ─── table matrix ───────────────────────────────────────────────────

interface TableCase {
  table: string
  /** World key of the seeded row. */
  idKey: string
  /** An unreferenced row to attempt DELETE on, so an FK can never be what
   *  stops the delete (that would make the test pass for the wrong reason). */
  deleteKey?: string
  /** A valid new row a resident should NOT be able to insert. */
  insert: (w: World) => Record<string, unknown>
  /** A change a resident should NOT be able to make; `col` is re-read to verify. */
  patch: Record<string, unknown>
  col: string
}

const TABLES: TableCase[] = [
  {
    table: 'journal_entries',
    deleteKey: 'jeSpare',
    idKey: 'je',
    insert: (w) => ({
      organization_id: w.org.orgId,
      association_id: w.org.associationId,
      fiscal_period_id: w.acct.fiscalPeriodId,
      entry_number: `JE-R-${randomUUID().slice(0, 6)}`,
      entry_date: '2026-01-10',
      memo: 'resident-posted',
      source: 'manual',
      status: 'draft',
    }),
    patch: { memo: 'tampered' },
    col: 'memo',
  },
  {
    table: 'ledger_entries',
    idKey: 'ledger',
    insert: (w) => ({
      organization_id: w.org.orgId,
      journal_entry_id: w.ids.je,
      account_id: w.acct.accountIds['1010'],
      fund_id: w.acct.fundIds.OPERATING,
      debit_amount: 999,
      credit_amount: 0,
    }),
    patch: { debit_amount: 999 },
    col: 'debit_amount',
  },
  {
    table: 'assessments',
    deleteKey: 'assessmentSpare',
    idKey: 'assessmentMine',
    insert: (w) => ({
      organization_id: w.org.orgId,
      association_id: w.org.associationId,
      unit_id: w.unitNeighbor,
      fiscal_period_id: w.acct.fiscalPeriodId,
      assessment_type: 'fine',
      amount: 5000,
      due_date: '2026-01-01',
    }),
    // The headline: a resident marking their own dues paid.
    patch: { status: 'paid' },
    col: 'status',
  },
  {
    table: 'payments',
    idKey: 'paymentMine',
    insert: (w) => ({
      organization_id: w.org.orgId,
      unit_id: w.unitMine,
      assessment_id: w.ids.assessmentMine,
      amount: 300,
      payment_method: 'cash',
      paid_at: '2026-01-06T00:00:00Z',
    }),
    patch: { amount: 300 },
    col: 'amount',
  },
  {
    table: 'bank_accounts',
    deleteKey: 'bankAccountSpare',
    idKey: 'bankAccount',
    insert: (w) => ({
      organization_id: w.org.orgId,
      association_id: w.org.associationId,
      fund_id: w.acct.fundIds.OPERATING,
      account_name: 'Resident Account',
    }),
    patch: { account_name: 'tampered' },
    col: 'account_name',
  },
  {
    table: 'bank_transactions',
    deleteKey: 'bankTxnSpare',
    idKey: 'bankTxn',
    insert: (w) => ({
      organization_id: w.org.orgId,
      bank_account_id: w.ids.bankAccount,
      amount: 1,
      posted_date: '2026-01-07',
    }),
    patch: { match_method: 'manual' },
    col: 'match_method',
  },
  {
    table: 'bank_reconciliations',
    idKey: 'bankRec',
    insert: (w) => ({ organization_id: w.org.orgId, bank_account_id: w.ids.bankAccount, statement_date: '2026-02-28' }),
    patch: { approved_at: '2026-02-01T00:00:00Z' },
    col: 'approved_at',
  },
  {
    table: 'funds',
    deleteKey: 'fundSpare',
    idKey: 'fundOperating',
    insert: (w) => ({
      organization_id: w.org.orgId,
      association_id: w.org.associationId,
      code: `R${randomUUID().slice(0, 5)}`,
      name: 'Resident Fund',
      fund_type: 'capex',
    }),
    patch: { name: 'tampered' },
    col: 'name',
  },
  {
    table: 'chart_of_accounts',
    deleteKey: 'coaSpare',
    idKey: 'coaCash',
    insert: (w) => ({
      organization_id: w.org.orgId,
      association_id: w.org.associationId,
      account_number: `9${randomUUID().replace(/\D/g, '').slice(0, 3)}`,
      account_name: 'Resident Account',
      account_type: 'expense',
    }),
    patch: { account_name: 'tampered' },
    col: 'account_name',
  },
  {
    table: 'fiscal_periods',
    deleteKey: 'periodSpare',
    idKey: 'fiscalPeriod',
    insert: (w) => ({
      organization_id: w.org.orgId,
      association_id: w.org.associationId,
      start_date: '2030-01-01',
      end_date: '2030-12-31',
    }),
    patch: { status: 'closed' },
    col: 'status',
  },
  {
    table: 'budgets',
    deleteKey: 'budgetSpare',
    idKey: 'budget',
    insert: (w) => ({
      organization_id: w.org.orgId,
      association_id: w.org.associationId,
      fiscal_period_id: w.acct.fiscalPeriodId,
      fund_id: w.acct.fundIds.RESERVE,
      status: 'draft',
    }),
    patch: { status: 'approved' },
    col: 'status',
  },
  {
    table: 'budget_line_items',
    idKey: 'budgetLine',
    insert: (w) => ({ budget_id: w.ids.budget, account_id: w.acct.accountIds['5010'], amount: 1 }),
    patch: { amount: 1 },
    col: 'amount',
  },
  {
    table: 'invoices',
    idKey: 'invoice',
    insert: (w) => ({
      organization_id: w.org.orgId,
      association_id: w.org.associationId,
      invoice_number: 'INV-RESIDENT',
      invoice_date: '2026-01-08',
      amount: 9999,
    }),
    patch: { status: 'paid' },
    col: 'status',
  },
  {
    table: 'payment_plans',
    idKey: 'paymentPlan',
    insert: (w) => ({
      organization_id: w.org.orgId,
      unit_id: w.unitMine,
      total_amount: 300,
      installment_count: 300,
      installment_amount: 1,
      start_date: '2026-02-01',
    }),
    patch: { status: 'active' },
    col: 'status',
  },
  {
    table: 'payment_methods',
    idKey: 'paymentMethod',
    insert: (w) => ({ organization_id: w.org.orgId, unit_id: w.unitNeighbor, method_type: 'card' }),
    patch: { last4: '9999' },
    col: 'last4',
  },
  {
    table: 'zelle_inbound_matches',
    idKey: 'zelle',
    insert: (w) => ({
      organization_id: w.org.orgId,
      bank_transaction_id: w.ids.bankTxn,
      memo_code: 'RESIDENT',
      matched_assessment_id: w.ids.assessmentMine,
      status: 'manual_override',
    }),
    patch: { status: 'matched' },
    col: 'status',
  },
  {
    table: 'recurring_journal_entries',
    idKey: 'recurring',
    insert: (w) => ({
      organization_id: w.org.orgId,
      association_id: w.org.associationId,
      template_je_id: w.ids.je,
      cadence: 'daily',
      next_run_date: '2026-02-01',
    }),
    patch: { cadence: 'daily' },
    col: 'cadence',
  },
  {
    table: 'adjusting_entries',
    idKey: 'adjusting',
    insert: (w) => ({ journal_entry_id: w.ids.je, reason: 'resident' }),
    patch: { reason: 'tampered' },
    col: 'reason',
  },
  {
    table: 'closing_entries',
    idKey: 'closing',
    insert: (w) => ({ fiscal_period_id: w.acct.fiscalPeriodId, journal_entry_id: w.ids.je, closing_type: 'inter_fund_transfer' }),
    patch: { closing_type: 'expense_to_equity' },
    col: 'closing_type',
  },
  {
    table: 'plaid_items',
    idKey: 'plaidItem',
    insert: (w) => ({
      organization_id: w.org.orgId,
      association_id: w.org.associationId,
      plaid_item_id: `item-${randomUUID()}`,
      access_token: 'resident-token',
    }),
    patch: { access_token: 'tampered' },
    col: 'access_token',
  },
  {
    table: 'hoa_dues',
    idKey: 'hoaDues',
    insert: (w) => ({ org_id: w.org.orgId, period: '2026-02', amount_due: 1, due_date: '2026-02-01' }),
    patch: { status: 'paid' },
    col: 'status',
  },
]

/** Tables a resident has NO legitimate read of (resident portal reads none of them). */
const BOARD_ONLY_READ = TABLES.map((t) => t.table).filter((t) => t !== 'assessments' && t !== 'payments')

function from(client: Db, table: string) {
  // The matrix is untyped by design: one loop covers 21 tables.
  return client.from(table as never)
}

async function read(table: string, id: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await from(adminDb(), table).select('*').eq('id' as never, id as never).maybeSingle()
  if (error) throw new Error(`read ${table}: ${error.message}`)
  return data as Record<string, unknown> | null
}

async function countRows(table: string, col: string, value: string): Promise<number> {
  const { count, error } = await from(adminDb(), table)
    .select('id', { count: 'exact', head: true })
    .eq(col as never, value as never)
  if (error) throw new Error(`count ${table}: ${error.message}`)
  return count ?? 0
}

let w: World

beforeAll(async () => {
  await truncateAll()
  w = await seedWorld()
  w.ids.fundOperating = w.acct.fundIds.OPERATING
  w.ids.coaCash = w.acct.accountIds['1010']
  w.ids.fiscalPeriod = w.acct.fiscalPeriodId
})

// ─── resident writes ────────────────────────────────────────────────

describe('a resident cannot write accounting tables', () => {
  for (const t of TABLES) {
    it(`INSERT ${t.table}`, async () => {
      const { error } = await from(w.resident.client, t.table).insert(t.insert(w) as never)
      expect(error, `a resident inserted into ${t.table}`).not.toBeNull()
    })

    it(`UPDATE ${t.table}`, async () => {
      const id = w.ids[t.idKey]
      const before = await read(t.table, id)
      expect(before, `seed row for ${t.table} missing`).not.toBeNull()
      await from(w.resident.client, t.table).update(t.patch as never).eq('id' as never, id as never)
      const after = await read(t.table, id)
      expect(after?.[t.col], `a resident changed ${t.table}.${t.col}`).toEqual(before?.[t.col])
    })

  }

  it('cannot post a balanced journal entry through the real postJournalEntry path', async () => {
    const res = await postJournalEntry(w.resident.client, {
      organizationId: w.org.orgId,
      associationId: w.org.associationId,
      fiscalPeriodId: w.acct.fiscalPeriodId,
      entryDate: '2026-01-15',
      memo: 'resident self-credit',
      source: 'manual',
      lines: [
        { accountId: w.acct.accountIds['1010'], fundId: w.acct.fundIds.OPERATING, debit: 300, credit: 0 },
        { accountId: w.acct.accountIds['1100'], fundId: w.acct.fundIds.OPERATING, debit: 0, credit: 300 },
      ],
    })
    expect(res.ok, 'a resident posted a journal entry').toBe(false)
    expect(await countRows('journal_entries', 'memo', 'resident self-credit')).toBe(0)
  })
})

// ─── resident reads ─────────────────────────────────────────────────

describe('resident reads', () => {
  it('sees their own open assessments exactly as getDues() queries them (ownership)', async () => {
    const { data, error } = await w.resident.client
      .from('assessments')
      .select('id, unit_id, amount, due_date, status, assessment_type')
      .in('unit_id', [w.unitMine])
      .in('status', ['open', 'partial'])
      .is('deleted_at', null)
    expect(error).toBeNull()
    expect((data ?? []).map((r) => r.id)).toEqual([w.ids.assessmentMine])
  })

  it('sees payments on their own assessments (getDues second query)', async () => {
    const { data, error } = await w.resident.client
      .from('payments')
      .select('assessment_id, amount')
      .in('assessment_id', [w.ids.assessmentMine])
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('a resident linked only by property_residents email still sees their dues and payments', async () => {
    const a = await w.emailResident.client
      .from('assessments')
      .select('id')
      .in('unit_id', [w.unitByEmail])
      .in('status', ['open', 'partial'])
      .is('deleted_at', null)
    expect(a.error).toBeNull()
    expect((a.data ?? []).map((r) => r.id)).toEqual([w.ids.assessmentByEmail])

    const p = await w.emailResident.client
      .from('payments')
      .select('assessment_id, amount')
      .in('assessment_id', [w.ids.assessmentByEmail])
    expect(p.error).toBeNull()
    expect(p.data).toHaveLength(1)
  })

  it("cannot read a neighbour's assessments or payments", async () => {
    const a = await w.resident.client.from('assessments').select('id').eq('organization_id', w.org.orgId)
    expect(a.error).toBeNull()
    expect((a.data ?? []).map((r) => r.id)).toEqual([w.ids.assessmentMine])

    const p = await w.resident.client.from('payments').select('id').eq('organization_id', w.org.orgId)
    expect(p.error).toBeNull()
    expect((p.data ?? []).map((r) => r.id)).toEqual([w.ids.paymentMine])
  })

  for (const table of BOARD_ONLY_READ) {
    it(`reads nothing from ${table}`, async () => {
      const { data, error } = await from(w.resident.client, table).select('*')
      expect(error, 'expected a clean empty result, not a query error').toBeNull()
      expect(data ?? [], `a resident can read ${table}`).toHaveLength(0)
    })
  }
})

// ─── board / admin keep working ─────────────────────────────────────

describe('board and admin keep full accounting access', () => {
  it('board reads every table in the matrix, including neighbours rows', async () => {
    for (const t of TABLES) {
      if (t.table === 'plaid_items') continue // write-only for users; see below
      const { data, error } = await from(w.board.client, t.table).select('id')
      expect(error, `board read ${t.table}`).toBeNull()
      expect((data ?? []).length, `board sees no ${t.table} rows`).toBeGreaterThan(0)
    }
  })

  it('board posts a journal entry through postJournalEntry (draft -> lines -> posted)', async () => {
    const res = await postJournalEntry(w.board.client, {
      organizationId: w.org.orgId,
      associationId: w.org.associationId,
      fiscalPeriodId: w.acct.fiscalPeriodId,
      entryDate: '2026-01-20',
      memo: 'board-posted',
      source: 'manual',
      lines: [
        { accountId: w.acct.accountIds['5000'], fundId: w.acct.fundIds.OPERATING, debit: 50, credit: 0 },
        { accountId: w.acct.accountIds['1010'], fundId: w.acct.fundIds.OPERATING, debit: 0, credit: 50 },
      ],
    })
    expect(res.ok ? null : res.error).toBeNull()
    if (res.ok) expect((await read('journal_entries', res.journalEntryId))?.status).toBe('posted')
  })

  it('board marks an assessment paid and records the payment (markAssessmentPaid shape)', async () => {
    const pay = await w.board.client.from('payments').insert({
      organization_id: w.org.orgId,
      unit_id: w.unitNeighbor,
      assessment_id: w.ids.assessmentNeighbor,
      amount: 200,
      payment_method: 'check',
      paid_at: '2026-01-21T00:00:00Z',
    })
    expect(pay.error).toBeNull()
    const upd = await w.board.client.from('assessments').update({ status: 'paid' }).eq('id', w.ids.assessmentNeighbor)
    expect(upd.error).toBeNull()
    expect((await read('assessments', w.ids.assessmentNeighbor))?.status).toBe('paid')
  })

  it('board works the bank queue (update txn, insert zelle audit row)', async () => {
    const upd = await w.board.client
      .from('bank_transactions')
      .update({ match_method: 'manual', match_confidence: 0 })
      .eq('id', w.ids.bankTxn)
    expect(upd.error).toBeNull()
    expect((await read('bank_transactions', w.ids.bankTxn))?.match_method).toBe('manual')
    const ins = await w.board.client.from('zelle_inbound_matches').insert({
      organization_id: w.org.orgId,
      bank_transaction_id: w.ids.bankTxn,
      memo_code: 'IGNORED',
      status: 'manual_override',
    })
    expect(ins.error).toBeNull()
  })

  it('board links Plaid (insert without RETURNING, as /api/plaid/exchange does) but cannot read tokens back', async () => {
    const itemId = `item-${randomUUID()}`
    const ins = await w.board.client.from('plaid_items' as never).insert({
      organization_id: w.org.orgId,
      association_id: w.org.associationId,
      plaid_item_id: itemId,
      access_token: 'access-board',
    } as never)
    expect(ins.error).toBeNull()
    expect(await countRows('plaid_items', 'plaid_item_id', itemId)).toBe(1)

    const sel = await w.board.client.from('plaid_items' as never).select('access_token')
    expect(sel.error).toBeNull()
    expect(sel.data ?? [], 'Plaid access tokens are readable by a user session').toHaveLength(0)
  })

  it('board edits budgets and line items, and closes a period', async () => {
    const b = await w.board.client.from('budget_line_items').update({ amount: 1234 }).eq('id', w.ids.budgetLine)
    expect(b.error).toBeNull()
    expect(Number((await read('budget_line_items', w.ids.budgetLine))?.amount)).toBe(1234)

    const { data: p, error: pErr } = await w.board.client
      .from('fiscal_periods')
      .insert({
        organization_id: w.org.orgId,
        association_id: w.org.associationId,
        start_date: '2031-01-01',
        end_date: '2031-12-31',
      })
      .select('id')
      .single()
    expect(pErr).toBeNull()
    const close = await w.board.client.from('fiscal_periods').update({ status: 'closed' }).eq('id', p!.id)
    expect(close.error).toBeNull()
    expect((await read('fiscal_periods', p!.id))?.status).toBe('closed')
  })

  it('admin writes too (invoice insert + delete)', async () => {
    const { data, error } = await w.admin.client
      .from('invoices')
      .insert({
        organization_id: w.org.orgId,
        association_id: w.org.associationId,
        invoice_number: 'INV-ADMIN',
        invoice_date: '2026-01-09',
        amount: 10,
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    const del = await w.admin.client.from('invoices').delete().eq('id', data!.id)
    expect(del.error).toBeNull()
    expect(await read('invoices', data!.id)).toBeNull()
  })

  it('a board member of another org cannot write or read this org', async () => {
    const ins = await w.foreignBoard.client.from('journal_entries').insert({
      organization_id: w.org.orgId,
      association_id: w.org.associationId,
      fiscal_period_id: w.acct.fiscalPeriodId,
      entry_number: 'JE-FOREIGN',
      entry_date: '2026-01-10',
      memo: 'foreign',
      source: 'manual',
    })
    expect(ins.error).not.toBeNull()
    const sel = await w.foreignBoard.client.from('assessments').select('id').eq('organization_id', w.org.orgId)
    expect(sel.error).toBeNull()
    expect(sel.data ?? []).toHaveLength(0)
  })
})

// ─── double post (bank_rec) ─────────────────────────────────────────

describe('one posted bank_rec journal entry per bank transaction', () => {
  const post = (client: Db, txnId: string, memo: string) =>
    postJournalEntry(client, {
      organizationId: w.org.orgId,
      associationId: w.org.associationId,
      fiscalPeriodId: w.acct.fiscalPeriodId,
      entryDate: '2026-01-25',
      memo,
      source: 'bank_rec',
      sourceId: txnId,
      lines: [
        { accountId: w.acct.accountIds['1010'], fundId: w.acct.fundIds.OPERATING, debit: 75, credit: 0 },
        { accountId: w.acct.accountIds['1100'], fundId: w.acct.fundIds.OPERATING, debit: 0, credit: 75 },
      ],
    })

  it('a second posting for the same transaction fails and leaves no orphan draft', async () => {
    const txnId = randomUUID()
    const first = await post(w.board.client, txnId, 'confirm #1')
    expect(first.ok ? null : first.error).toBeNull()

    const second = await post(adminDb(), txnId, 'approval #2')
    expect(second.ok, 'the same bank transaction was posted twice').toBe(false)
    expect(await countRows('journal_entries', 'source_id', txnId)).toBe(1)
  })

  it('concurrent postings for one transaction: exactly one wins', async () => {
    const txnId = randomUUID()
    const results = await Promise.all([
      post(w.board.client, txnId, 'race manual'),
      post(adminDb(), txnId, 'race approval'),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    const { data } = await adminDb().from('journal_entries').select('status').eq('source_id', txnId)
    expect((data ?? []).filter((r) => r.status === 'posted')).toHaveLength(1)
  })

  it('a reversed posting frees the slot for a corrected re-match', async () => {
    const txnId = randomUUID()
    const first = await post(w.board.client, txnId, 'wrong match')
    expect(first.ok).toBe(true)
    if (!first.ok) return
    await adminDb().from('journal_entries').update({ status: 'reversed' }).eq('id', first.journalEntryId)
    const again = await post(w.board.client, txnId, 'right match')
    expect(again.ok ? null : again.error).toBeNull()
  })
})

// Last, so a pre-0061 run that DOES delete rows cannot starve the tests above.
describe('a resident cannot delete accounting rows', () => {
  for (const t of TABLES) {
    it(`DELETE ${t.table}`, async () => {
      const id = w.ids[t.deleteKey ?? t.idKey]
      expect(await read(t.table, id), `seed row for ${t.table} missing`).not.toBeNull()
      await from(w.resident.client, t.table).delete().eq('id' as never, id as never)
      expect(await read(t.table, id), `a resident deleted a ${t.table} row`).not.toBeNull()
    })
  }
})
