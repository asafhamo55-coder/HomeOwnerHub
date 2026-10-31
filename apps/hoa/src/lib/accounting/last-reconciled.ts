import { getSupabaseServerClient } from '@/lib/supabase/server'
import { chunk, readAll } from '@/lib/supabase/read-all'
import { queryFailed } from './queries'

/**
 * Latest reconciled_at per bank account, counting approved reconciliations only (read-only). Accounts never
 * reconciled are absent from the map. Throws on a failed read; callers wrap
 * it in tryLoad.
 */
export async function loadLastReconciled(accountIds: string[]): Promise<Map<string, string>> {
  return loadLatestApproved(accountIds, 'reconciled_at')
}

/**
 * Latest approved statement_date per bank account: the date the books are
 * reconciled through. Use this, not reconciled_at, to ask "is this account
 * reconciled through the period end?" (a September statement saved in
 * November is still only reconciled through September).
 */
export async function loadLastApprovedStatementDate(accountIds: string[]): Promise<Map<string, string>> {
  return loadLatestApproved(accountIds, 'statement_date')
}

async function loadLatestApproved(
  accountIds: string[],
  field: 'reconciled_at' | 'statement_date',
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (accountIds.length === 0) return out
  const db = await getSupabaseServerClient()
  for (const part of chunk(accountIds)) {
    const rows = await readAll<{ bank_account_id: string; reconciled_at: string | null; statement_date: string | null }>(
      (from, to) =>
        db
          .from('bank_reconciliations')
          .select('id, bank_account_id, reconciled_at, statement_date')
          .in('bank_account_id', part)
          .not('reconciled_at', 'is', null)
          // reconciled_at is stamped when the statement is saved; only an
          // approved reconciliation means the account was actually reconciled.
          .not('approved_at', 'is', null)
          .order('id', { ascending: true })
          .range(from, to),
      queryFailed,
    )
    for (const r of rows) {
      const value = r[field]
      if (!value) continue
      const prev = out.get(r.bank_account_id)
      if (!prev || value > prev) out.set(r.bank_account_id, value)
    }
  }
  return out
}
