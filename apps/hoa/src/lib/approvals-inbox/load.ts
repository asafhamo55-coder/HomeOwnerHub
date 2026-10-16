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
import {
  SECTION_LIMIT,
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

export async function loadW3Section(db: InboxDb, orgId: string): Promise<InboxSection> {
  const res = await loadOrFail(
    'approvals: violation drafts',
    db
      .from('ai_runs')
      .select('id, created_at, input, output, citations, reasoning_trace', { count: 'exact' })
      .eq('organization_id', orgId)
      .eq('workflow_id', 'W3')
      .eq('status', 'pending_human_approval')
      .order('created_at', { ascending: true })
      .range(0, SECTION_LIMIT - 1),
  )
  if (!res.ok) return { source: 'w3', ok: false }
  const runs = (res.data ?? []) as unknown as W3RunRow[]
  return { source: 'w3', ok: true, items: w3Items(runs), total: res.count ?? runs.length }
}

/**
 * Head-only counts for the sidebar badge: four index-backed counts, no
 * rows. Same predicates as the sections (the vendor one mirrors
 * vendorNeedsBoard: yellow/red/missing, or green on a prospect; deleted
 * vendors excluded). A failed count is null — unknown, never 0.
 */
export async function countPendingApprovals(db: InboxDb, orgId: string): Promise<SourceCounts> {
  const [w18, w3, vendorGaps, vendorReady] = await Promise.all([
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
      'approvals badge: violation drafts',
      db
        .from('ai_runs')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('workflow_id', 'W3')
        .eq('status', 'pending_human_approval'),
    ),
    loadOrFail(
      'approvals badge: vendor gaps',
      db
        .from('vendor_compliance')
        .select('vendor_id, vendors!inner(id)', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .in('coi_status', ['yellow', 'red', 'missing'])
        .is('vendors.deleted_at', null),
    ),
    loadOrFail(
      'approvals badge: vendors ready',
      db
        .from('vendor_compliance')
        .select('vendor_id, vendors!inner(id)', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('coi_status', 'green')
        .eq('vendors.status', 'prospect')
        .is('vendors.deleted_at', null),
    ),
  ])
  const count = (r: { ok: true; count: number | null } | { ok: false }) => (r.ok ? (r.count ?? 0) : null)
  const gaps = count(vendorGaps)
  const ready = count(vendorReady)
  return {
    w18: count(w18),
    w3: count(w3),
    vendor: gaps === null || ready === null ? null : gaps + ready,
  }
}
