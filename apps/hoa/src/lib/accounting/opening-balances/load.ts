// BL-126 — what the opening-balance wizard and its server action read.
// Always the caller's own client: funds, accounts, units and fiscal periods
// are org-scoped by RLS (0061), and approval_requests is board/admin-only
// (0060). One loader for the page and the action, so the review the board
// sees is built from the same books the proposal is.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { loadOrFail } from '../../load-or-fail'
import { readAllResult } from '../../supabase/read-all'
import { OPENING_ACTION, readOpeningPayload, type OpeningPayload } from './proposal'
import type { BooksAccountRow, BooksFundRow, BooksUnitRow } from './model'

export type OpeningDb = SupabaseClient<Database>

export interface OpeningPeriod {
  id: string
  start_date: string
  end_date: string
  status: string
}

export interface OpeningProposalRow {
  id: string
  status: string
  proposedAt: string
  decidedAt: string | null
  postedAt: string | null
  journalEntryId: string | null
  /** The board's reason, for a rejection. Shown to the board only. */
  reason: string | null
  failed: boolean
  payload: OpeningPayload | null
}

export interface OpeningBooksData {
  funds: BooksFundRow[]
  accounts: BooksAccountRow[]
  units: BooksUnitRow[]
  periods: OpeningPeriod[]
  proposals: OpeningProposalRow[]
  /** Charges already open on homes (dues entered by hand, for example). */
  openCharges: number
  /** Posted journal entries already in the ledger. */
  postedEntries: number
}

export async function loadOpeningBooks(
  db: OpeningDb,
  orgId: string,
  associationId: string,
): Promise<{ ok: true; data: OpeningBooksData } | { ok: false }> {
  const [funds, accounts, units, periods, proposals, openCharges, postedEntries] = await Promise.all([
    loadOrFail('opening balances: funds', db.from('funds').select('id, code, name, fund_type, is_active').eq('association_id', associationId)),
    loadOrFail(
      'opening balances: accounts',
      db
        .from('chart_of_accounts')
        .select('id, account_number, account_name, account_type, fund_id, is_active')
        .eq('association_id', associationId),
    ),
    loadOrFail(
      'opening balances: homes',
      readAllResult<BooksUnitRow>((from, to) =>
        db
          .from('units')
          .select('id, address_line1, unit_number, lot_number')
          .eq('association_id', associationId)
          .order('id', { ascending: true })
          .range(from, to),
      ),
    ),
    loadOrFail(
      'opening balances: fiscal periods',
      db.from('fiscal_periods').select('id, start_date, end_date, status').eq('association_id', associationId).order('start_date', { ascending: true }),
    ),
    loadOrFail(
      'opening balances: proposals',
      db
        .from('approval_requests')
        .select('id, status, proposed_at, decided_at, posted_at, result_ref, decision_reason, error, payload')
        .eq('organization_id', orgId)
        .eq('action_type', OPENING_ACTION)
        .eq('payload->>associationId' as never, associationId)
        .order('proposed_at', { ascending: false })
        .limit(20),
    ),
    loadOrFail(
      'opening balances: open charges',
      db.from('assessments').select('id', { count: 'exact', head: true }).eq('association_id', associationId).in('status', ['open', 'partial']),
    ),
    loadOrFail(
      'opening balances: posted entries',
      db.from('journal_entries').select('id', { count: 'exact', head: true }).eq('association_id', associationId).eq('status', 'posted'),
    ),
  ])
  if (!funds.ok || !accounts.ok || !units.ok || !periods.ok || !proposals.ok || !openCharges.ok || !postedEntries.ok) return { ok: false }
  return {
    ok: true,
    data: {
      funds: (funds.data ?? []) as BooksFundRow[],
      accounts: (accounts.data ?? []) as BooksAccountRow[],
      units: units.data ?? [],
      periods: (periods.data ?? []) as OpeningPeriod[],
      proposals: ((proposals.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        status: String(r.status),
        proposedAt: String(r.proposed_at),
        decidedAt: (r.decided_at as string | null) ?? null,
        postedAt: (r.posted_at as string | null) ?? null,
        journalEntryId: (r.result_ref as string | null) ?? null,
        reason: (r.decision_reason as string | null) ?? null,
        failed: r.status === 'failed',
        payload: readOpeningPayload(r.payload),
      })),
      openCharges: openCharges.count ?? 0,
      postedEntries: postedEntries.count ?? 0,
    },
  }
}
