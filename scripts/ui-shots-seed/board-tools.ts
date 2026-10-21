import type { SupabaseClient } from '@supabase/supabase-js'
import { signKit, withKit } from '../../apps/hoa/src/lib/meeting-quorum/store'
import type { HomeEntry } from '../../apps/hoa/src/lib/meeting-quorum/quorum'
import { composeRecordsRequest, dueInstant } from '../../apps/hoa/src/lib/records-requests/law'
import { LOCAL_SERVICE_KEY } from '../../tests/integration/setup/env'
import type { SeedContext } from '../ui-shots-seed'

/**
 * Demo rows for the 2026-10 board screens that had no seeded data to show:
 *
 *   - an annual meeting held today, with a signed quorum kit (quorum 30%,
 *     two proxies, two check-ins; every other home is on the chase list)
 *     → `annualMeetingId` (/meetings/:id/quorum, …/proxies, …/sign-in);
 *   - opened books for the demo association: Operating and Reserve funds,
 *     the cash / fund-balance / AR / prepaid / payable accounts the
 *     opening-balance wizard needs, and a closed 2025 fiscal year with
 *     posted entries, an approved year-end bank reconciliation and a
 *     vendor paid over the 1099 threshold (/accounting/reports/year-end);
 *   - three insurance policies, one expiring within 30 days and one
 *     fidelity bond (/insurance);
 *   - two owner records requests, one due soon and one overdue
 *     (/tickets/records);
 *   - a scheduled fine hearing on a 128 Demo Court violation
 *     → `hearingViolationId`;
 *   - a snoozed inbox thread (/inbox?filter=snoozed).
 *
 * Runs last among the HOA seeders: it reuses the homes (seed_properties),
 * the mailbox (seed_dashboard), the vendor (seed_approvals) and, for the
 * chart of accounts, only fills in numbers seed_screens has not taken, so
 * the budget-notice shot keeps its demo account names.
 *
 * Local CI Supabase only. Idempotent; relative dates are re-set each run.
 * Invented data only: "Demo"/"Sample" names, reserved-TLD emails.
 * One failing part skips only its own shots.
 */
export async function seed_board_tools(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const vars: Record<string, string> = {}
  const steps: Array<[string, () => Promise<Record<string, string>>]> = [
    ['quorum kit', () => seedQuorum(db, ctx)],
    ['books', () => seedBooks(db, ctx)],
    ['insurance', () => seedInsurance(db, ctx)],
    ['records requests', () => seedRecordsRequests(db, ctx)],
    ['violation hearing', () => seedHearing(db, ctx)],
    ['snoozed thread', () => seedSnoozedThread(db, ctx)],
  ]
  for (const [what, run] of steps) {
    try {
      Object.assign(vars, await run())
    } catch (e) {
      console.log(`seed board tools: ${what} failed — ${(e as Error).message}`)
    }
  }
  console.log(`seed board tools: ok (${Object.keys(vars).join(', ') || 'no vars'})`)
  return vars
}

const DAY = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()
const day = (ms: number) => iso(ms).slice(0, 10)

/** The org's primary association: first by name, as the app picks it. */
async function primaryAssociation(db: SupabaseClient, org: string): Promise<{ id: string; compliance_settings: unknown } | null> {
  const { data, error } = await db
    .from('associations')
    .select('id, compliance_settings')
    .eq('organization_id', org)
    .order('name')
    .limit(1)
  if (error) throw new Error(`associations read: ${error.code}`)
  return (data?.[0] as { id: string; compliance_settings: unknown } | undefined) ?? null
}

// ─── Quorum kit ──────────────────────────────────────────────────────

async function seedQuorum(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const org = ctx.hoaOrgId
  const now = Date.now()
  const assoc = await primaryAssociation(db, org)
  if (!assoc) return {}

  // Held today (meeting night), noticed 20 days ahead, so the counter and
  // check-ins read naturally and /legal/compliance sees a timely notice.
  const annualMeetingId = await upsertByKey(
    db,
    'hoa_meeting_minutes',
    { org_id: org, raw_transcript: 'ui-shots: annual members meeting' },
    {
      meeting_type: 'annual',
      meeting_date: day(now),
      status: 'draft',
      ai_summary: '1. Call to order and quorum\n2. Election of two directors\n3. 2027 budget presentation\n4. Owner comments',
      notice_posted_at: iso(now - 20 * DAY),
      created_at: iso(now - 30 * DAY),
    },
  )

  const { data: props, error } = await db
    .from('hoa_properties')
    .select('id, address')
    .eq('org_id', org)
    .is('deleted_at', null)
    .order('id')
  if (error) throw new Error(`hoa_properties read: ${error.code}`)
  const list = (props ?? []) as Array<{ id: string; address: string | null }>
  const byAddress = (a: string, fallback: number) => list.find((p) => p.address === a)?.id ?? list[fallback]?.id
  const homes: Record<string, HomeEntry> = {}
  const set = (id: string | undefined, entry: HomeEntry) => {
    if (id && !homes[id]) homes[id] = entry
  }
  set(byAddress('13 Demo Court', 0), { proxy: { kind: 'general', at: iso(now - 5 * DAY) }, presentAt: null })
  set(byAddress('9 Mock Lane', 1), { proxy: { kind: 'limited', at: iso(now - 3 * DAY) }, presentAt: null })
  set(byAddress('128 Demo Court', 2), { proxy: null, presentAt: iso(now - 20 * 60_000) })
  set(byAddress('1200 Demo Court', 3), { proxy: null, presentAt: iso(now - 15 * 60_000) })

  // Signed the way the board's save signs it (the dev server's secret is
  // the local service key; see ui-shots.ts and seed_resident's Zelle note).
  const secret = process.env.PAY_SETTINGS_SECRET || LOCAL_SERVICE_KEY
  const stored = signKit(
    assoc.id,
    annualMeetingId,
    { memberMeeting: false, quorumPct: 30, homes },
    { updatedAt: iso(now - 10 * 60_000), updatedBy: ctx.userId },
    secret,
  )
  const { error: uErr } = await db
    .from('associations')
    .update({ compliance_settings: withKit(assoc.compliance_settings, annualMeetingId, stored) })
    .eq('id', assoc.id)
  if (uErr) throw new Error(`quorum kit save: ${uErr.code}`)
  return { annualMeetingId }
}

// ─── Books ───────────────────────────────────────────────────────────

// The accounts the opening-balance wizard and the year-end preview use,
// as apps/hoa/src/lib/association-setup.ts DEFAULT_CHART_OF_ACCOUNTS
// defines them. Only numbers not already present are added.
const BOOK_ACCOUNTS: Array<[string, string, 'asset' | 'liability' | 'equity' | 'income' | 'expense', 'OPERATING' | 'RESERVE' | null]> = [
  ['1010', 'Cash — Operating', 'asset', 'OPERATING'],
  ['1020', 'Cash — Reserve', 'asset', 'RESERVE'],
  ['1100', 'Accounts Receivable', 'asset', null],
  ['2010', 'Accounts Payable', 'liability', null],
  ['2100', 'Prepaid Assessments', 'liability', 'OPERATING'],
  ['3000', 'Fund Balance — Operating', 'equity', 'OPERATING'],
  ['3010', 'Fund Balance — Reserve', 'equity', 'RESERVE'],
  ['4000', 'Assessment Income', 'income', 'OPERATING'],
  ['4200', 'Interest Income', 'income', 'RESERVE'],
  ['5000', 'Landscaping', 'expense', 'OPERATING'],
  ['5040', 'Repairs & Maintenance', 'expense', 'OPERATING'],
]

async function seedBooks(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const org = ctx.hoaOrgId
  const assoc = await primaryAssociation(db, org)
  if (!assoc) return {}
  const associationId = assoc.id

  const fund: Record<'OPERATING' | 'RESERVE', string> = {
    OPERATING: await findOrCreate(
      db,
      'funds',
      { association_id: associationId, code: 'OPERATING' },
      { organization_id: org, name: 'Operating Fund', fund_type: 'operating' },
    ),
    RESERVE: await findOrCreate(
      db,
      'funds',
      { association_id: associationId, code: 'RESERVE' },
      { organization_id: org, name: 'Reserve Fund', fund_type: 'reserve' },
    ),
  }

  const { data: have, error: cErr } = await db.from('chart_of_accounts').select('account_number').eq('association_id', associationId)
  if (cErr) throw new Error(`chart_of_accounts read: ${cErr.code}`)
  const taken = new Set(((have ?? []) as Array<{ account_number: string }>).map((a) => a.account_number))
  const missing = BOOK_ACCOUNTS.filter(([n]) => !taken.has(n))
  if (missing.length > 0) {
    const { error } = await db.from('chart_of_accounts').insert(
      missing.map(([account_number, account_name, account_type, f]) => ({
        organization_id: org,
        association_id: associationId,
        account_number,
        account_name,
        account_type,
        fund_id: f ? fund[f] : null,
      })),
    )
    if (error) throw new Error(`chart_of_accounts insert: ${error.code}`)
  }
  const { data: accts, error: aErr } = await db.from('chart_of_accounts').select('id, account_number').eq('association_id', associationId)
  if (aErr) throw new Error(`chart_of_accounts reread: ${aErr.code}`)
  const acct = new Map(((accts ?? []) as Array<{ id: string; account_number: string }>).map((a) => [a.account_number, a.id]))

  // This year open (seed_dashboard usually made it), last year closed.
  await findOrCreate(
    db,
    'fiscal_periods',
    { organization_id: org, association_id: associationId, start_date: '2026-01-01' },
    { end_date: '2026-12-31', status: 'open' },
  )
  const priorId = await findOrCreate(
    db,
    'fiscal_periods',
    { association_id: associationId, start_date: '2025-01-01' },
    { organization_id: org, end_date: '2025-12-31', status: 'closed', closed_at: '2026-01-20T17:00:00Z', closed_by: ctx.userId },
  )

  // Posted 2025 entries, each balanced per fund.
  type Line = [account: string, fund: 'OPERATING' | 'RESERVE', debit: number, credit: number]
  const entries: Array<{ number: string; date: string; memo: string; lines: Line[] }> = [
    { number: 'JE-2025-UI001', date: '2025-03-31', memo: 'Assessments collected, January to June (demo)', lines: [['1010', 'OPERATING', 18_600, 0], ['4000', 'OPERATING', 0, 18_600]] },
    { number: 'JE-2025-UI002', date: '2025-06-12', memo: 'Pool pump repair, Demo Pool Services (demo)', lines: [['5040', 'OPERATING', 2_400, 0], ['1010', 'OPERATING', 0, 2_400]] },
    { number: 'JE-2025-UI003', date: '2025-09-30', memo: 'Assessments collected, July to December (demo)', lines: [['1010', 'OPERATING', 6_200, 0], ['4000', 'OPERATING', 0, 6_200]] },
    { number: 'JE-2025-UI004', date: '2025-11-30', memo: 'Landscaping contract, 2025 (demo)', lines: [['5000', 'OPERATING', 7_800, 0], ['1010', 'OPERATING', 0, 7_800]] },
    { number: 'JE-2025-UI005', date: '2025-12-31', memo: 'Reserve account interest (demo)', lines: [['1020', 'RESERVE', 412.5, 0], ['4200', 'RESERVE', 0, 412.5]] },
  ]
  for (const e of entries) {
    const { data: found } = await db
      .from('journal_entries')
      .select('id, status')
      .eq('association_id', associationId)
      .eq('entry_number', e.number)
      .limit(1)
    const row = found?.[0] as { id: string; status: string } | undefined
    if (row?.status === 'posted') continue
    // A draft left by a failed run is rebuilt from scratch.
    if (row) await db.from('journal_entries').delete().eq('id', row.id)
    const { data: je, error } = await db
      .from('journal_entries')
      .insert({
        organization_id: org,
        association_id: associationId,
        fiscal_period_id: priorId,
        entry_number: e.number,
        entry_date: e.date,
        memo: e.memo,
        source: 'manual',
        status: 'draft',
        created_by: ctx.userId,
      })
      .select('id')
      .single()
    if (error || !je) throw new Error(`journal_entries insert: ${error?.code}`)
    const jeId = (je as { id: string }).id
    const lines = e.lines.map(([number, f, debit, credit]) => {
      const accountId = acct.get(number)
      if (!accountId) throw new Error(`account ${number} missing`)
      return { organization_id: org, journal_entry_id: jeId, account_id: accountId, fund_id: fund[f], debit_amount: debit, credit_amount: credit }
    })
    const { error: lErr } = await db.from('ledger_entries').insert(lines)
    if (lErr) throw new Error(`ledger_entries insert: ${lErr.code}`)
    // Posting runs the balance trigger.
    const { error: pErr } = await db
      .from('journal_entries')
      .update({ status: 'posted', posted_at: `${e.date}T18:00:00Z`, posted_by: ctx.userId })
      .eq('id', jeId)
    if (pErr) throw new Error(`journal_entries post: ${pErr.code}`)
  }

  // Operating checking, reconciled and approved to the 2025 year end.
  const bankId = await findOrCreate(
    db,
    'bank_accounts',
    { association_id: associationId, account_name: 'Operating checking (demo)' },
    { organization_id: org, fund_id: fund.OPERATING, bank_name: 'Sample Community Bank', last4: '0142', current_balance: 14_600 },
  )
  await findOrCreate(
    db,
    'bank_reconciliations',
    { bank_account_id: bankId, statement_date: '2025-12-31' },
    {
      organization_id: org,
      statement_balance: 14_600,
      reconciled_balance: 14_600,
      reconciled_at: '2026-01-10T16:00:00Z',
      reconciled_by: ctx.userId,
      approved_at: '2026-01-12T16:00:00Z',
      approved_by: ctx.userId,
    },
  )

  // A vendor paid over the 1099-NEC threshold in 2025 (seed_approvals' vendor).
  const { data: v } = await db.from('vendors').select('id').eq('organization_id', org).eq('legal_name', 'Demo Pool Services (demo)').limit(1)
  const vendorId = (v?.[0] as { id: string } | undefined)?.id
  if (vendorId) {
    const invoiceId = await findOrCreate(
      db,
      'invoices',
      { association_id: associationId, invoice_number: 'UI-2025-POOL-06' },
      { organization_id: org, vendor_id: vendorId, invoice_date: '2025-06-01', due_date: '2025-06-30', amount: 2_400, status: 'paid' },
    )
    await findOrCreate(
      db,
      'payments',
      { invoice_id: invoiceId },
      { organization_id: org, amount: 2_400, payment_method: 'check', external_ref: 'Check 1042', paid_at: '2025-06-12T15:00:00Z' },
    )
  }
  return {}
}

// ─── Insurance ───────────────────────────────────────────────────────

async function seedInsurance(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const org = ctx.hoaOrgId
  const now = Date.now()
  const assoc = await primaryAssociation(db, org)
  const policies: Array<{ number: string; kind: string; carrier: string; limit: number; deductible: number | null; premium: number; expiresIn: number; notes: string | null }> = [
    // Expires within 30 days: the reminder and the "expiring" countdown.
    { number: 'UI-PROP-0001', kind: 'property', carrier: 'Sample Mutual Insurance (demo)', limit: 4_500_000, deductible: 25_000, premium: 18_400, expiresIn: 21, notes: 'Clubhouse, pool house and common-area structures.' },
    { number: 'UI-GL-0002', kind: 'liability', carrier: 'Demo Casualty Company (demo)', limit: 2_000_000, deductible: 5_000, premium: 6_250, expiresIn: 190, notes: null },
    { number: 'UI-FID-0003', kind: 'fidelity', carrier: 'Example Surety Group (demo)', limit: 250_000, deductible: null, premium: 1_150, expiresIn: 300, notes: 'Covers board members and the management company.' },
  ]
  for (const p of policies) {
    const expires = now + p.expiresIn * DAY
    await upsertByKey(
      db,
      'insurance_policies',
      { organization_id: org, policy_number: p.number },
      {
        association_id: assoc?.id ?? null,
        kind: p.kind,
        carrier: p.carrier,
        coverage_limit_cents: p.limit * 100,
        deductible_cents: p.deductible === null ? null : p.deductible * 100,
        premium_cents: p.premium * 100,
        effective_on: day(expires - 365 * DAY),
        expires_on: day(expires),
        notes: p.notes,
      },
    )
  }
  return {}
}

// ─── Records requests ────────────────────────────────────────────────

async function seedRecordsRequests(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const org = ctx.hoaOrgId
  const now = Date.now()
  // The unit seed_resident gives the shots user (first by address).
  const { data: units } = await db
    .from('units')
    .select('id, association_id')
    .eq('organization_id', org)
    .not('association_id', 'is', null)
    .order('address_line1')
    .limit(1)
  const unit = units?.[0] as { id: string; association_id: string } | undefined
  if (!unit) return {}

  const requests = [
    {
      fields: { kind: 'financial', period: 'current', format: 'electronic', details: 'The 2026 bank statements and the reserve study, please.' },
      receivedDaysAgo: 12,
      dueInDays: 2, // due soon (within RECORDS_DUE_SOON_DAYS)
    },
    {
      fields: { kind: 'minutes', period: 'prior', format: 'inspect', details: 'Board meeting minutes from 2024 and 2025.' },
      receivedDaysAgo: 21,
      dueInDays: -5, // overdue
    },
  ] as const
  for (const r of requests) {
    const { subject, description } = composeRecordsRequest(r.fields)
    await upsertByKey(
      db,
      'tickets',
      { organization_id: org, submitted_by: ctx.userId, subject },
      {
        association_id: unit.association_id,
        unit_id: unit.id,
        category: 'records_request',
        description,
        status: 'open',
        priority: 'normal',
        created_at: iso(now - r.receivedDaysAgo * DAY),
        records_due_at: dueInstant(day(now + r.dueInDays * DAY)),
      },
    )
  }
  return {}
}

// ─── Fine hearing ────────────────────────────────────────────────────

async function seedHearing(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const org = ctx.hoaOrgId
  const now = Date.now()
  // seed_properties' past-cure violation on 128 Demo Court.
  const { data: v } = await db
    .from('hoa_violations')
    .select('id')
    .eq('org_id', org)
    .eq('description', 'ui-shots: trash cans visible from street')
    .limit(1)
  const hearingViolationId = (v?.[0] as { id: string } | undefined)?.id
  if (!hearingViolationId) return {}
  await upsertByKey(
    db,
    'violation_hearings',
    { violation_id: hearingViolationId },
    {
      organization_id: org,
      status: 'scheduled',
      requested_at: iso(now - 9 * DAY),
      requested_by: ctx.userId,
      resident_statement: 'The cans were out for two days while we were travelling. They are back behind the fence now.',
      hearing_on: day(now + 12 * DAY),
      hearing_time: '18:30',
      location: 'Clubhouse meeting room, 1 Sample Way',
      panel: [
        { name: 'Alex Sample', role: 'member' },
        { name: 'Jordan Example', role: 'member' },
        { name: 'Casey Placeholder', role: 'member' },
      ],
      notice_sent_on: day(now - 2 * DAY),
      outcome: null,
      decided_on: null,
    },
  )
  return { hearingViolationId }
}

// ─── Snoozed inbox thread ────────────────────────────────────────────

async function seedSnoozedThread(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const org = ctx.hoaOrgId
  const now = Date.now()
  const { data: mb } = await db
    .from('mailbox_accounts')
    .select('id')
    .eq('organization_id', org)
    .eq('email_address', 'board@ui-shots.example.test')
    .limit(1)
  const mailboxId = (mb?.[0] as { id: string } | undefined)?.id
  if (!mailboxId) return {}
  const from = 'lee.sample@ui-shots.example.test'
  const sentAt = iso(now - 2 * DAY)
  const threadId = await findOrCreate(
    db,
    'inbox_threads',
    { organization_id: org, mailbox_account_id: mailboxId, gmail_thread_id: 'ui-shots-thread-snoozed' },
    {
      subject: 'Clubhouse rental for a December party',
      status: 'needs_review',
      gmail_state: 'active',
      last_direction: 'inbound',
      last_message_at: sentAt,
    },
  )
  await findOrCreate(
    db,
    'inbox_messages',
    { thread_id: threadId, gmail_message_id: 'ui-shots-msg-snoozed-1' },
    {
      organization_id: org,
      mailbox_account_id: mailboxId,
      direction: 'inbound',
      from_name: 'Lee Sample',
      from_email: from,
      to_emails: ['board@ui-shots.example.test'],
      subject: 'Clubhouse rental for a December party',
      body_text: 'Hi, could we book the clubhouse for a family party on December 19? Happy to pay the deposit.\n\nLee',
      stripped_text: 'Hi, could we book the clubhouse for a family party on December 19? Happy to pay the deposit.',
      sent_at: sentAt,
    },
  )
  // After the message: a new inbound message clears snoozed_until (0067).
  const { error } = await db
    .from('inbox_threads')
    .update({ snoozed_until: iso(now + 3 * DAY) })
    .eq('id', threadId)
  if (error) throw new Error(`inbox_threads snooze: ${error.code}`)
  return {}
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function findOrCreate(
  db: SupabaseClient,
  table: string,
  match: Record<string, string>,
  rest: Record<string, unknown>,
): Promise<string> {
  let q = db.from(table).select('id')
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
  const { data } = await q.limit(1)
  const found = (data?.[0] as { id: string } | undefined)?.id
  if (found) return found
  const { data: row, error } = await db.from(table).insert({ ...match, ...rest }).select('id').single()
  if (error || !row) throw new Error(`${table} insert: ${error?.code}`)
  return (row as { id: string }).id
}

/** Find by `match`, then update with `rest` (dates stay relative to today), or insert. */
async function upsertByKey(
  db: SupabaseClient,
  table: string,
  match: Record<string, string>,
  rest: Record<string, unknown>,
): Promise<string> {
  let q = db.from(table).select('id')
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
  const { data, error: findErr } = await q.limit(1)
  if (findErr) throw new Error(`${table} find: ${findErr.code}`)
  const found = (data?.[0] as { id: string } | undefined)?.id
  if (found) {
    const { error } = await db.from(table).update(rest).eq('id', found)
    if (error) throw new Error(`${table} update: ${error.code}`)
    return found
  }
  const { data: row, error } = await db.from(table).insert({ ...match, ...rest }).select('id').single()
  if (error || !row) throw new Error(`${table} insert: ${error?.code}`)
  return (row as { id: string }).id
}
