/**
 * BL-175b schema ratchet (migrations/0070_tenant_isolation.sql). CI only (no
 * local database).
 *
 * Two invariants, read from the catalog of the replayed schema:
 *
 *   1. every table in `public` has row level security ON;
 *   2. every foreign key whose child AND parent both carry an org column
 *      (organization_id or org_id) is covered by a same-org rule: a
 *      `tenant_fk_same_org(fk, parent, ...)` trigger, a hand-written
 *      `*_scope` / `*_org` trigger whose function names the column and the
 *      parent table (0067-0069 style), or a composite FK that includes the
 *      child's org column. Anything else must be on the explicit allowlist
 *      below, with a reason.
 *
 * WHY. RLS checks only a row's own org, so the admin of a self-made org can
 * plant a foreign key into another org's rows (the BL-175 audit). Each new
 * org-scoped table with a cross-table FK is a fresh chance to repeat that. A
 * new uncovered FK must either get a trigger (preferred) or an allowlist line
 * that someone has to defend in review.
 *
 * HOW TO ADD AN FK. Put it in a migration with
 *   CREATE TRIGGER <child>_<col>_org_scope BEFORE INSERT OR UPDATE OF <col>, <org col>
 *   ON <child> FOR EACH ROW EXECUTE FUNCTION public.tenant_fk_same_org(
 *     '<col>', '<parent>', '<parent org col>', '<child org col>');
 * and it passes here with no other change.
 *
 * ALLOWLIST. Seeded from a static read of migrations/ (the FKs that existed
 * when 0070 landed and are NOT covered by it). If this test fails on a key
 * that was already in the schema and is not in your change, it is a gap in
 * that static read: add the key under the matching reason after checking that
 * no service-role path follows it without an org filter. Allowlist entries
 * that become covered are reported (not failed) so the list can shrink.
 */
import { describe, expect, it } from 'vitest'
import { psqlRows } from '../fixtures/psql'

/** key = `child.column->parent`. */
type Allow = Record<string, string[]>

const ALLOWLIST: Allow = {
  'Accounting is board/admin-only (0061); no resident read path and no resident write path. The service-role jobs that follow these (W18, recurring JEs, Plaid sync) read by id inside one org. TODO(BL-175c): trigger the ones a job follows.': [
    'funds.association_id->associations',
    'chart_of_accounts.association_id->associations',
    'chart_of_accounts.parent_account_id->chart_of_accounts',
    'chart_of_accounts.fund_id->funds',
    'fiscal_periods.association_id->associations',
    'journal_entries.association_id->associations',
    'journal_entries.fiscal_period_id->fiscal_periods',
    'journal_entries.reversed_by_id->journal_entries',
    'journal_entries.reverses_id->journal_entries',
    'ledger_entries.journal_entry_id->journal_entries',
    'ledger_entries.account_id->chart_of_accounts',
    'ledger_entries.fund_id->funds',
    'budgets.association_id->associations',
    'budgets.fiscal_period_id->fiscal_periods',
    'budgets.fund_id->funds',
    'bank_accounts.association_id->associations',
    'bank_accounts.fund_id->funds',
    'bank_transactions.matched_journal_entry_id->journal_entries',
    'bank_reconciliations.bank_account_id->bank_accounts',
    'assessments.association_id->associations',
    'assessments.unit_id->units',
    'assessments.fiscal_period_id->fiscal_periods',
    'invoices.association_id->associations',
    'invoices.vendor_id->vendors',
    'payments.unit_id->units',
    'payments.assessment_id->assessments',
    'payments.invoice_id->invoices',
    'payments.journal_entry_id->journal_entries',
    'payment_methods.unit_id->units',
    'payment_plans.unit_id->units',
    'zelle_inbound_matches.bank_transaction_id->bank_transactions',
    'zelle_inbound_matches.matched_assessment_id->assessments',
    'zelle_inbound_matches.matched_unit_id->units',
    'recurring_journal_entries.association_id->associations',
    'plaid_items.association_id->associations',
    'dues_rates.association_id->associations',
    'dues_rates.budget_id->budgets',
    'collection_cases.association_id->associations',
    'collection_cases.unit_id->units',
    'collection_events.collection_case_id->collection_cases',
    'collection_events.communication_id->communications',
  ],
  'Vendor and RFP tables are board/admin-only (0012); vendors never read another org through these keys.': [
    'vendor_compliance.vendor_id->vendors',
    'vendor_compliance.association_id->associations',
    'vendor_documents.vendor_id->vendors',
    'rfps.association_id->associations',
    'rfps.awarded_to_vendor_id->vendors',
    'rfp_invitations.rfp_id->rfps',
    'rfp_invitations.vendor_id->vendors',
    'bids.rfp_id->rfps',
    'bids.vendor_id->vendors',
    'bid_comparisons.rfp_id->rfps',
    'vendor_internal_ratings.vendor_id->vendors',
    'vendor_internal_ratings.association_id->associations',
    'vendor_onboarding_invitations.vendor_id->vendors',
  ],
  'Inbox, communications and governance children: board-only tables, or rows whose resident-visible policy re-checks the child row’s own org (0063, 0064). The mailbox / thread keys a send job follows ARE covered by 0070.': [
    'inbox_threads.unit_id->units',
    'inbox_threads.resident_id->property_residents',
    'inbox_threads.vendor_id->vendors',
    'inbox_messages.thread_id->inbox_threads',
    'inbox_messages.communication_id->communications',
    'inbox_messages.mailbox_account_id->mailbox_accounts',
    'inbox_attachments.thread_id->inbox_threads',
    'inbox_attachments.message_id->inbox_messages',
    'inbox_sender_aliases.unit_id->units',
    'inbox_sender_aliases.resident_id->property_residents',
    'inbox_thread_links.thread_id->inbox_threads',
    'inbox_reply_embeddings.message_id->inbox_messages',
    'inbox_drafts.source_thread_id->inbox_threads',
    'inbox_drafts.vendor_id->vendors',
    'inbox_draft_attachments.draft_id->inbox_drafts',
    'communications.association_id->associations',
    'communications.template_id->communication_templates',
    'communication_templates.association_id->associations',
    'communication_templates.source_template_id->communication_templates',
    'communication_threads.association_id->associations',
    'communication_threads.unit_id->units',
    'communication_threads.topic_label->communications',
    'communication_recipients.unit_id->units',
    'communication_replies.communication_id->communications',
    'communication_replies.recipient_id->communication_recipients',
    'resident_communication_preferences.unit_id->units',
    'hoa_recurring_events.association_id->associations',
    'lease_waiting_list.association_id->associations',
    'lease_waiting_list.property_id->hoa_properties',
    'property_events.property_id->hoa_properties',
    'meeting_action_items.meeting_id->hoa_meeting_minutes',
    'meeting_action_items.ticket_id->tickets',
    'governing_documents.association_id->associations',
    'governing_document_chunks.document_id->governing_documents',
    'hoa_document_versions.document_id->hoa_documents',
    'insurance_policies.association_id->associations',
    'compliance_deadlines_done.association_id->associations',
    'owner_join_codes.unit_id->units',
    'owner_join_requests.unit_id->units',
    'owner_join_requests.code_id->owner_join_codes',
  ],
  'Resident-submitted rows: the unit / association is checked by the 0063 insert policy (unit_id = ANY auth_resident_unit_ids(), now org-scoped by 0070). A board-planted association is not reachable by a resident.': [
    'units.association_id->associations',
    'units.legacy_pm_property_id->pm_properties',
    'tickets.association_id->associations',
    'arc_requests.association_id->associations',
    'arc_requests.unit_id->units',
    'resident_violation_reports.association_id->associations',
    'resident_violation_reports.about_unit_id->units',
  ],
  'AI audit rows are written by the service role only; users hold SELECT (0070 L5).': ['ai_feedback.ai_run_id->ai_runs'],
}

const ALLOWED = new Map<string, string>(Object.entries(ALLOWLIST).flatMap(([reason, keys]) => keys.map((k) => [k, reason] as const)))

/** Tables that legitimately have RLS off. Empty on purpose; add with a reason. */
const RLS_OFF_ALLOWLIST: Record<string, string> = {}

describe('schema ratchet: row level security', () => {
  it('every table in public has RLS enabled', () => {
    const rows = psqlRows<{ relname: string }>(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind in ('r', 'p')
          and not c.relispartition
          and not c.relrowsecurity
          and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
        order by 1`,
    )
      .map((r) => r.relname)
      .filter((t) => !(t in RLS_OFF_ALLOWLIST))
    expect(rows, 'tables with RLS off: enable it (a table with RLS on and no policy is service-role-only)').toEqual([])
  })
})

interface FkRow {
  child: string
  col: string
  parent: string
  covered: boolean
}

function orgForeignKeys(): FkRow[] {
  return psqlRows<FkRow>(`
    with org_col as (
      select c.oid as relid, c.relname,
             (select a.attname from pg_attribute a
               where a.attrelid = c.oid and a.attname in ('organization_id', 'org_id') and not a.attisdropped
               order by (a.attname = 'organization_id') desc limit 1) as orgcol
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p')
    ), fk as (
      select con.oid as conid, con.conrelid, con.confrelid, con.conkey,
             ch.relname as child, ch.orgcol as child_org, pa.relname as parent,
             a.attname as col
        from pg_constraint con
        join org_col ch on ch.relid = con.conrelid
        join org_col pa on pa.relid = con.confrelid
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
       where con.contype = 'f'
         and ch.orgcol is not null and pa.orgcol is not null
         and pa.relname <> 'orgs'
         and a.attname not in ('organization_id', 'org_id')
    )
    select fk.child, fk.col, fk.parent,
           (
             -- composite FK that includes the child's org column
             exists (select 1 from pg_attribute a2
                      where a2.attrelid = fk.conrelid and a2.attnum = any (fk.conkey) and a2.attname = fk.child_org)
             -- generic trigger: tgargs = fk col, parent, parent org col, child org col
             or exists (
               select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                where t.tgrelid = fk.conrelid and not t.tgisinternal
                  and p.proname = 'tenant_fk_same_org'
                  and encode(t.tgargs, 'escape') like fk.col || '\\\\000' || fk.parent || '\\\\000%')
             -- hand-written scope trigger whose function names the column and the parent table
             or exists (
               select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                where t.tgrelid = fk.conrelid and not t.tgisinternal
                  and p.proname <> 'tenant_fk_same_org'
                  and p.prosrc like '%' || fk.col || '%' and p.prosrc like '%' || fk.parent || '%'
                  and (t.tgname like '%scope%' or t.tgname like '%org%' or p.proname like '%scope%' or p.proname like '%org%'))
           ) as covered
      from fk
     order by 1, 2, 3`)
}

describe('schema ratchet: org-scoped foreign keys', () => {
  const fks = orgForeignKeys()

  it('finds the keys it is meant to guard (the query itself works)', () => {
    const keys = new Set(fks.map((f) => `${f.child}.${f.col}->${f.parent}`))
    for (const k of [
      'ownerships.unit_id->units',
      'inbox_drafts.mailbox_account_id->mailbox_accounts',
      'bank_transactions.bank_account_id->bank_accounts',
      'units.legacy_hoa_property_id->hoa_properties',
    ]) {
      expect(keys.has(k), `${k} not found by the ratchet query`).toBe(true)
    }
  })

  it('the keys 0070 covers are seen as covered', () => {
    const covered = new Set(fks.filter((f) => f.covered).map((f) => `${f.child}.${f.col}->${f.parent}`))
    for (const k of [
      'inbox_drafts.mailbox_account_id->mailbox_accounts',
      'inbox_drafts.thread_id->inbox_threads',
      'inbox_threads.mailbox_account_id->mailbox_accounts',
      'bank_transactions.bank_account_id->bank_accounts',
      'recurring_journal_entries.template_je_id->journal_entries',
      'ownerships.unit_id->units',
      'tenancies.unit_id->units',
      'property_residents.property_id->hoa_properties',
      'units.legacy_hoa_property_id->hoa_properties',
      'communication_recipients.communication_id->communications',
      'tickets.unit_id->units',
      'communication_threads.root_communication_id->communications',
      'communications.thread_id->communication_threads',
      'hoa_dues.property_id->hoa_properties',
      'hoa_violations.property_id->hoa_properties',
      'pm_rent_ledger.property_id->pm_properties',
    ]) {
      expect(covered.has(k), `${k} is not covered by a same-org trigger`).toBe(true)
    }
  })

  it('every uncovered key is on the allowlist', () => {
    const uncovered = fks
      .filter((f) => !f.covered)
      .map((f) => `${f.child}.${f.col}->${f.parent}`)
      .filter((k) => !ALLOWED.has(k))
    expect(
      uncovered,
      'foreign keys between org-scoped tables with no same-org trigger: add tenant_fk_same_org (see this file’s header) or allowlist with a reason',
    ).toEqual([])
  })

  it('reports allowlist entries that are now covered (informational: shrink the list)', () => {
    const coveredNow = new Set(fks.filter((f) => f.covered).map((f) => `${f.child}.${f.col}->${f.parent}`))
    const stale = [...ALLOWED.keys()].filter((k) => coveredNow.has(k))
    if (stale.length > 0) console.warn(`fk-same-org-ratchet: ${stale.length} allowlisted keys are now covered: ${stale.join(', ')}`)
    expect(Array.isArray(stale)).toBe(true)
  })
})
