// BL-014 loaders. Take the caller's Supabase client (the signed-in user's
// RLS client in the app, a minted board JWT in tests/integration), so
// every read is the board member's own: approval_requests and ai_runs are
// board/admin-only by RLS (0060, 0036).
//
// Relative imports only — tests/integration imports this file and has no
// `@/` path mapping in tsconfig.integration.json.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { loadOrFail } from '../load-or-fail'
import { BILL_ACTION } from '../bill-scan/proposal'
import { FOLLOW_UP_AWAITING_SAVE_PATH } from '../violation-follow-up'
import { contactTicketsQuery, loadContactEntries, type ContactTicketRow } from '../contact-updates/apply'
import {
  SECTION_LIMIT,
  arcItems,
  billItems,
  contactItems,
  type ArcRunRow,
  type BillProposalRow,
  type AssociationVendorCount,
  w18Items,
  w3Items,
  type InboxSection,
  type SourceCounts,
  type W18ProposalRow,
  type W18RunRow,
  type W3RunRow,
} from './model'

export type InboxDb = SupabaseClient<Database>

const W18_ACTION = 'w18.cash_receipt'
const W37 = 'W37'

export async function loadW18Section(db: InboxDb, orgId: string): Promise<InboxSection> {
  const res = await loadOrFail(
    'approvals: proposed postings',
    db
      .from('approval_requests')
      .select('id, subject_id, summary, amount, proposed_at', { count: 'exact' })
      .eq('organization_id', orgId)
      .eq('action_type', W18_ACTION)
      .eq('status', 'proposed')
      .order('proposed_at', { ascending: true })
      .range(0, SECTION_LIMIT - 1),
  )
  if (!res.ok) return { source: 'w18', ok: false }
  const proposals = (res.data ?? []) as W18ProposalRow[]
  const total = res.count ?? proposals.length
  if (proposals.length === 0) return { source: 'w18', ok: true, items: [], total }

  // The matcher's notes for exactly these transactions (same lookup as the
  // matching queue). Their failure costs the reasoning, not the postings.
  const runs = await loadOrFail(
    'approvals: matcher notes',
    db
      .from('ai_runs')
      .select('input, output, created_at')
      .eq('organization_id', orgId)
      .eq('workflow_id', 'W18')
      .in(
        'input->>bankTransactionId',
        proposals.map((p) => p.subject_id),
      )
      .order('created_at', { ascending: false }),
  )
  const items = w18Items(proposals, runs.ok ? ((runs.data ?? []) as unknown as W18RunRow[]) : null)
  return runs.ok ? { source: 'w18', ok: true, items, total } : { source: 'w18', ok: true, items, total, notesFailed: true }
}

/** BL-021: proposed bill entries, oldest first. Same read rule as W18. */
export async function loadBillSection(db: InboxDb, orgId: string): Promise<InboxSection> {
  const res = await loadOrFail(
    'approvals: scanned bills',
    db
      .from('approval_requests')
      .select('id, summary, amount, proposed_at, payload', { count: 'exact' })
      .eq('organization_id', orgId)
      .eq('action_type', BILL_ACTION)
      .eq('status', 'proposed')
      .order('proposed_at', { ascending: true })
      .range(0, SECTION_LIMIT - 1),
  )
  if (!res.ok) return { source: 'bill', ok: false }
  const rows = (res.data ?? []) as unknown as BillProposalRow[]
  return { source: 'bill', ok: true, items: billItems(rows), total: res.count ?? rows.length }
}

export async function loadW3Section(db: InboxDb, orgId: string): Promise<InboxSection> {
  const res = await loadOrFail(
    'approvals: violation drafts',
    db
      .from('ai_runs')
      .select('id, created_at, input, output, citations, reasoning_trace', { count: 'exact' })
      .eq('organization_id', orgId)
      .eq('workflow_id', 'W3')
      .eq('status', 'pending_human_approval')
      // A follow-up letter the board has not saved yet is not in Approvals.
      .is(FOLLOW_UP_AWAITING_SAVE_PATH as never, null)
      .order('created_at', { ascending: true })
      .range(0, SECTION_LIMIT - 1),
  )
  if (!res.ok) return { source: 'w3', ok: false }
  const runs = (res.data ?? []) as unknown as W3RunRow[]
  return { source: 'w3', ok: true, items: w3Items(runs), total: res.count ?? runs.length }
}

/** BL-027: pending W37 ARC review drafts, oldest first. Same read rule as W3. */
export async function loadArcSection(db: InboxDb, orgId: string, opts: { associationName?: string | null } = {}): Promise<InboxSection> {
  const res = await loadOrFail(
    'approvals: ARC reviews',
    db
      .from('ai_runs')
      .select('id, created_at, input, output', { count: 'exact' })
      .eq('organization_id', orgId)
      .eq('workflow_id', W37)
      .eq('status', 'pending_human_approval')
      .order('created_at', { ascending: true })
      .range(0, SECTION_LIMIT - 1),
  )
  if (!res.ok) return { source: 'arc', ok: false }
  const runs = (res.data ?? []) as unknown as ArcRunRow[]
  return { source: 'arc', ok: true, items: arcItems(runs, opts), total: res.count ?? runs.length }
}

/**
 * PR-10: residents' contact updates still open, oldest first, with each
 * one's home and records (a fixed number of queries). Tickets are
 * board-readable by RLS (0063). A failed read of the records fails the
 * section: approving needs them, so the rows are not shown half-known.
 */
export async function loadContactSection(db: InboxDb, orgId: string): Promise<InboxSection> {
  const res = await loadOrFail(
    'approvals: contact updates',
    contactTicketsQuery(db, orgId)
      .order('created_at' as never, { ascending: true })
      .range(0, SECTION_LIMIT - 1),
  )
  if (!res.ok) return { source: 'contact', ok: false }
  const tickets = (res.data ?? []) as unknown as ContactTicketRow[]
  const total = res.count ?? tickets.length
  if (tickets.length === 0) return { source: 'contact', ok: true, items: [], total }
  const loaded = await loadContactEntries(db, orgId, tickets)
  if (!loaded.ok) return { source: 'contact', ok: false }
  return { source: 'contact', ok: true, items: contactItems(tickets, loaded.entries), total }
}

/**
 * Vendors needing the board in ONE association: two index-backed head
 * counts mirroring vendorNeedsBoard (yellow/red/missing, or green on a
 * prospect; deleted vendors excluded). Scoped to an association because
 * compliance is per association — counting org-wide counted a vendor once
 * per association it is reviewed for (BL-048). Null = a count failed.
 */
async function countVendorsNeedingBoard(db: InboxDb, orgId: string, associationId: string): Promise<number | null> {
  const [gaps, ready] = await Promise.all([
    loadOrFail(
      'approvals badge: vendor gaps',
      db
        .from('vendor_compliance')
        .select('vendor_id, vendors!inner(id)', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('association_id', associationId)
        .in('coi_status', ['yellow', 'red', 'missing'])
        .is('vendors.deleted_at', null),
    ),
    loadOrFail(
      'approvals badge: vendors ready',
      db
        .from('vendor_compliance')
        .select('vendor_id, vendors!inner(id)', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('association_id', associationId)
        .eq('coi_status', 'green')
        .eq('vendors.status', 'prospect')
        .is('vendors.deleted_at', null),
    ),
  ])
  return gaps.ok && ready.ok ? (gaps.count ?? 0) + (ready.count ?? 0) : null
}

/** The org's associations, first by name — getPrimaryAssociation's rule. */
async function loadAssociations(db: InboxDb, orgId: string) {
  return loadOrFail(
    'approvals: associations',
    db.from('associations').select('id, name').eq('organization_id', orgId).order('name', { ascending: true }),
  )
}

/**
 * Head-only counts for the sidebar badge. Same predicates as the sections.
 * The vendor count is the PRIMARY association's, because that is the list
 * /approvals and /vendors/approval-queue show; other associations are
 * broken out on the page (loadVendorCountsByAssociation). No association
 * means the vendor list is empty, so 0. A failed count is null — unknown,
 * never 0.
 */
export async function countPendingApprovals(db: InboxDb, orgId: string): Promise<SourceCounts> {
  const vendorCount = async (): Promise<number | null> => {
    const assocs = await loadAssociations(db, orgId)
    if (!assocs.ok) return null
    const primary = (assocs.data ?? [])[0]
    return primary ? countVendorsNeedingBoard(db, orgId, primary.id) : 0
  }
  const [w18, bill, w3, arc, contact, vendor] = await Promise.all([
    loadOrFail(
      'approvals badge: postings',
      db
        .from('approval_requests')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('action_type', W18_ACTION)
        .eq('status', 'proposed'),
    ),
    loadOrFail(
      'approvals badge: scanned bills',
      db
        .from('approval_requests')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('action_type', BILL_ACTION)
        .eq('status', 'proposed'),
    ),
    loadOrFail(
      'approvals badge: violation drafts',
      db
        .from('ai_runs')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('workflow_id', 'W3')
        .eq('status', 'pending_human_approval')
        .is(FOLLOW_UP_AWAITING_SAVE_PATH as never, null),
    ),
    loadOrFail(
      'approvals badge: ARC reviews',
      db
        .from('ai_runs')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('workflow_id', W37)
        .eq('status', 'pending_human_approval'),
    ),
    loadOrFail('approvals badge: contact updates', contactTicketsQuery(db, orgId, { head: true })),
    vendorCount(),
  ])
  const count = (r: { ok: true; count: number | null } | { ok: false }) => (r.ok ? (r.count ?? 0) : null)
  return { w18: count(w18), bill: count(bill), w3: count(w3), arc: count(arc), contact: count(contact), vendor }
}

/**
 * BL-048: per-association vendor counts for a multi-association org. An
 * org with one association (or none) gets no rows — the section's own
 * count already says it all — and no extra queries.
 */
export async function loadVendorCountsByAssociation(
  db: InboxDb,
  orgId: string,
): Promise<{ ok: true; rows: AssociationVendorCount[] } | { ok: false }> {
  const assocs = await loadAssociations(db, orgId)
  if (!assocs.ok) return { ok: false }
  const list = assocs.data ?? []
  if (list.length <= 1) return { ok: true, rows: [] }
  const counts = await Promise.all(list.map((a) => countVendorsNeedingBoard(db, orgId, a.id)))
  return {
    ok: true,
    rows: list.map((a, i) => ({ associationId: a.id, name: a.name, count: counts[i], primary: i === 0 })),
  }
}
