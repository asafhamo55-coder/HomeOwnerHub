import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeedContext } from '../ui-shots-seed'
import { extraOrg } from './setup'

/**
 * Demo rows for screens release notes and the product deck need that no
 * other seeder reaches:
 *
 *   - an inbox thread filed under 128 Demo Court (the context panel and the
 *     "Create from email" menu) → `inboxThreadId`;
 *   - a sent announcement to "Everyone" that two of three homes haven't
 *     opened (the results page and its follow-up, which opens the composer
 *     on the phone preview) → `commsResultsId`;
 *   - an open collections case on 128 Demo Court (the collections letter);
 *   - an adopted 2026 operating budget (the owner budget notice)
 *     → `budgetNoticeId`;
 *   - a separate HOA org whose Stripe subscription is past due (Settings →
 *     Billing with the BL-103 banner) → `pastDueHoaOrgId`. Its own org, so
 *     the banner never shows on the main demo org's shots.
 *
 * Runs after seed_dashboard (mailbox, fiscal period), seed_properties
 * (128 Demo Court and its unit) and seed_approvals (expense account 5100).
 * Local CI Supabase only. Idempotent; invented data only — "Demo"/"Sample"
 * names, reserved-TLD emails, Stripe ids that exist nowhere.
 */
export async function seed_screens(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const vars: Record<string, string> = {}
  const steps: Array<[string, () => Promise<Record<string, string>>]> = [
    ['inbox thread', () => seedInboxThread(db, ctx)],
    ['communication results', () => seedResults(db, ctx)],
    ['collections case', () => seedCollectionsCase(db, ctx)],
    ['budget notice', () => seedBudget(db, ctx)],
    ['past-due billing', () => seedPastDueBilling(db, ctx)],
  ]
  // One failure skips only its own shots (their vars stay unset).
  for (const [what, run] of steps) {
    try {
      Object.assign(vars, await run())
    } catch (e) {
      console.log(`seed screens: ${what} failed — ${(e as Error).message}`)
    }
  }
  console.log(`seed screens: ok (${Object.keys(vars).join(', ') || 'no vars'})`)
  return vars
}

const OWNER_EMAIL = 'pat.example@ui-shots.example.test'
const BOARD_EMAIL = 'board@ui-shots.example.test'

/** 128 Demo Court's bridged unit (seed_properties). */
async function demoUnit(db: SupabaseClient, org: string): Promise<{ id: string; association_id: string } | null> {
  const { data: home } = await db.from('hoa_properties').select('id').eq('org_id', org).eq('address', '128 Demo Court').limit(1)
  const homeId = (home?.[0] as { id: string } | undefined)?.id
  if (!homeId) return null
  const { data: unit } = await db
    .from('units')
    .select('id, association_id')
    .eq('organization_id', org)
    .eq('legacy_hoa_property_id', homeId)
    .not('association_id', 'is', null)
    .limit(1)
  return (unit?.[0] as { id: string; association_id: string } | undefined) ?? null
}

async function seedInboxThread(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const org = ctx.hoaOrgId
  const unit = await demoUnit(db, org)
  const { data: mb } = await db
    .from('mailbox_accounts')
    .select('id')
    .eq('organization_id', org)
    .eq('email_address', BOARD_EMAIL)
    .limit(1)
  const mailboxId = (mb?.[0] as { id: string } | undefined)?.id
  if (!unit || !mailboxId) return {}

  const threadId = await findOrCreate(
    db,
    'inbox_threads',
    { organization_id: org, mailbox_account_id: mailboxId, gmail_thread_id: 'ui-shots-thread-fence' },
    {
      subject: 'Fence repair and the pool gate code',
      unit_id: unit.id,
      match_confidence: 'high',
      match_source: 'auto',
      match_reason: { rule: 'resident_email', matched_on: OWNER_EMAIL },
      status: 'needs_review',
      gmail_state: 'active',
      last_direction: 'inbound',
      last_message_at: '2026-10-19T14:20:00Z',
    },
  )
  const messages = [
    {
      gmail_message_id: 'ui-shots-msg-fence-1',
      direction: 'inbound',
      from_name: 'Pat Example',
      from_email: OWNER_EMAIL,
      to_emails: [BOARD_EMAIL],
      sent_at: '2026-10-17T09:05:00Z',
      body_text:
        'Hi, a storm last night knocked two panels off our back fence. Do we need ARC approval to replace them with the same wood, or can we just repair it? Also, what is the new pool gate code?\n\nThanks,\nPat',
    },
    {
      gmail_message_id: 'ui-shots-msg-fence-2',
      direction: 'outbound',
      from_name: 'Demo Court HOA',
      from_email: BOARD_EMAIL,
      to_emails: [OWNER_EMAIL],
      sent_at: '2026-10-17T16:40:00Z',
      body_text: 'Hi Pat, sorry about the fence. Like-for-like repairs usually do not need ARC approval; we will confirm by Monday.',
    },
    {
      gmail_message_id: 'ui-shots-msg-fence-3',
      direction: 'inbound',
      from_name: 'Pat Example',
      from_email: OWNER_EMAIL,
      to_emails: [BOARD_EMAIL],
      sent_at: '2026-10-19T14:20:00Z',
      body_text: 'Thanks. The contractor can come Thursday. If it does need an application, can you send me the form?',
    },
  ]
  for (const m of messages) {
    await findOrCreate(
      db,
      'inbox_messages',
      { thread_id: threadId, gmail_message_id: m.gmail_message_id },
      {
        organization_id: org,
        mailbox_account_id: mailboxId,
        direction: m.direction,
        from_name: m.from_name,
        from_email: m.from_email,
        to_emails: m.to_emails,
        subject: m.direction === 'outbound' ? 'Re: Fence repair and the pool gate code' : 'Fence repair and the pool gate code',
        body_text: m.body_text,
        stripped_text: m.body_text,
        sent_at: m.sent_at,
      },
    )
  }
  return { inboxThreadId: threadId }
}

async function seedResults(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const org = ctx.hoaOrgId
  const { data: units } = await db
    .from('units')
    .select('id, association_id')
    .eq('organization_id', org)
    .not('association_id', 'is', null)
    .order('address_line1')
    .limit(3)
  const list = (units ?? []) as Array<{ id: string; association_id: string }>
  if (list.length < 3) return {}

  const commsResultsId = await findOrCreate(
    db,
    'communications',
    { organization_id: org, subject: 'Street repaving starts Monday (demo)' },
    {
      association_id: list[0]!.association_id,
      category: 'announcement',
      body_html:
        '<p>Crews repave Demo Court from Monday to Wednesday. Please park in your driveway or on Sample Way until the work is done.</p>',
      body_text: 'Crews repave Demo Court from Monday to Wednesday. Please park in your driveway or on Sample Way until the work is done.',
      channels: ['email', 'portal'],
      // `everyone` (not the guide seed's legacy `all`) so the follow-up offers itself.
      audience_definition: { kind: 'everyone' },
      audience_summary: 'Everyone (3)',
      status: 'sent',
      source: 'manual',
      sent_at: '2026-10-12T15:00:00Z',
      created_by: ctx.userId,
      sent_by: ctx.userId,
    },
  )
  const { count } = await db
    .from('communication_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('communication_id', commsResultsId)
  if (!count) {
    // Three homes: one opened, two delivered but unopened — the follow-up audience.
    const rows = list.flatMap((u, i) => {
      const opened = i === 0
      const base = { organization_id: org, communication_id: commsResultsId, unit_id: u.id, recipient_name: `Sample Owner ${i + 1}` }
      return [
        {
          ...base,
          email: `owner-results-${i + 1}@example.test`,
          channel: 'email',
          delivery_status: opened ? 'opened' : 'delivered',
          sent_at: '2026-10-12T15:00:00Z',
          delivered_at: '2026-10-12T15:00:06Z',
          opened_at: opened ? '2026-10-12T17:45:00Z' : null,
        },
        { ...base, email: null, channel: 'portal', delivery_status: 'delivered', sent_at: '2026-10-12T15:00:00Z' },
      ]
    })
    const { error } = await db.from('communication_recipients').insert(rows)
    if (error) throw new Error(`communication_recipients insert: ${error.code}`)
  }
  return { commsResultsId }
}

async function seedCollectionsCase(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const unit = await demoUnit(db, ctx.hoaOrgId)
  if (!unit) return {}
  const { data: live } = await db
    .from('collection_cases')
    .select('id')
    .eq('unit_id', unit.id)
    .is('deleted_at', null)
    .not('status', 'in', '(resolved,written_off)')
    .limit(1)
  if (!live?.length) {
    const { error } = await db.from('collection_cases').insert({
      organization_id: ctx.hoaOrgId,
      association_id: unit.association_id,
      unit_id: unit.id,
      status: 'monitoring',
      opened_on: '2026-09-15',
      created_by: ctx.userId,
    })
    if (error) throw new Error(`collection_cases insert: ${error.code}`)
  }
  // The shot reuses `propertyId` (seed_properties); nothing new to export.
  return {}
}

async function seedBudget(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const org = ctx.hoaOrgId
  const unit = await demoUnit(db, org)
  if (!unit) return {}
  const assoc = unit.association_id
  const { data: fp } = await db
    .from('fiscal_periods')
    .select('id')
    .eq('association_id', assoc)
    .eq('start_date', '2026-01-01')
    .limit(1)
  const periodId = (fp?.[0] as { id: string } | undefined)?.id
  if (!periodId) return {}

  const fundId = await findOrCreate(
    db,
    'funds',
    { association_id: assoc, code: 'OPERATING' },
    { organization_id: org, name: 'Operating', fund_type: 'operating' },
  )
  const account = (number: string, name: string, type: 'income' | 'expense') =>
    findOrCreate(
      db,
      'chart_of_accounts',
      { association_id: assoc, account_number: number },
      { organization_id: org, account_name: name, account_type: type },
    )
  const lines: Array<[string, number]> = [
    [await account('4100', 'Assessment income (demo)', 'income'), 23_400],
    [await account('5100', 'Landscaping (demo)', 'expense'), 9_600],
    [await account('5200', 'Pool service (demo)', 'expense'), 4_800],
    [await account('5300', 'Insurance (demo)', 'expense'), 6_000],
    [await account('5400', 'Reserve contribution (demo)', 'expense'), 3_000],
  ]

  const budgetNoticeId = await findOrCreate(
    db,
    'budgets',
    { association_id: assoc, fiscal_period_id: periodId, fund_id: fundId, status: 'approved' },
    { organization_id: org, approved_at: '2025-12-09T19:00:00Z', approved_by: ctx.userId },
  )
  const { count } = await db
    .from('budget_line_items')
    .select('id', { count: 'exact', head: true })
    .eq('budget_id', budgetNoticeId)
  if (!count) {
    const { error } = await db
      .from('budget_line_items')
      .insert(lines.map(([account_id, amount]) => ({ budget_id: budgetNoticeId, account_id, amount })))
    if (error) throw new Error(`budget_line_items insert: ${error.code}`)
  }
  return { budgetNoticeId }
}

const PAST_DUE_NAME = 'Past Due Court HOA'
const PAST_DUE_SUB = 'sub_uishots_past_due_demo'

async function seedPastDueBilling(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const pastDueHoaOrgId = await extraOrg(db, ctx, PAST_DUE_NAME, 'admin')
  const { error: oErr } = await db
    .from('orgs')
    .update({ plan: 'monthly', doors_count: 48, stripe_customer_id: 'cus_uishots_demo', stripe_sub_id: PAST_DUE_SUB })
    .eq('id', pastDueHoaOrgId)
  if (oErr) throw new Error(`past-due org update: ${oErr.code}`)

  // What the Stripe webhook records (ids and statuses only): the
  // subscription went active, then past_due — billingAttention() reads the
  // latest. Rebuilt each run so the banner state is exact.
  const actions = ['billing.subscription_updated', 'billing.invoice_payment_failed']
  const { error: dErr } = await db.from('audit_log').delete().eq('org_id', pastDueHoaOrgId).in('action', actions)
  if (dErr) throw new Error(`past-due audit reset: ${dErr.code}`)
  const row = (action: string, status: string | null, created: string, eventId: string) => ({
    org_id: pastDueHoaOrgId,
    action,
    entity_type: 'subscription',
    metadata: { sub_id: PAST_DUE_SUB, ...(status ? { status } : {}), event_created: created, event_id: eventId },
    created_at: created,
  })
  const { error: iErr } = await db.from('audit_log').insert([
    row('billing.subscription_updated', 'active', '2026-09-01T12:00:00.000Z', 'evt_uishots_demo_1'),
    row('billing.invoice_payment_failed', null, '2026-10-01T12:00:00.000Z', 'evt_uishots_demo_2'),
    row('billing.subscription_updated', 'past_due', '2026-10-01T12:00:05.000Z', 'evt_uishots_demo_3'),
  ])
  if (iErr) throw new Error(`past-due audit insert: ${iErr.code}`)
  return { pastDueHoaOrgId }
}

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
