import { getSupabaseServerClient } from '@/lib/supabase/server'
import { chunk, readAll } from '@/lib/supabase/read-all'
import { queryFailed } from './queries'

/**
 * Latest reconciled_at per bank account (read-only). Accounts never
 * reconciled are absent from the map. Throws on a failed read; callers wrap
 * it in tryLoad.
 */
export async function loadLastReconciled(accountIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (accountIds.length === 0) return out
  const db = await getSupabaseServerClient()
  for (const part of chunk(accountIds)) {
    const rows = await readAll<{ bank_account_id: string; reconciled_at: string | null }>(
      (from, to) =>
        db
          .from('bank_reconciliations')
          .select('id, bank_account_id, reconciled_at')
          .in('bank_account_id', part)
          .not('reconciled_at', 'is', null)
          .order('id', { ascending: true })
          .range(from, to),
      queryFailed,
    )
    for (const r of rows) {
      if (!r.reconciled_at) continue
      const prev = out.get(r.bank_account_id)
      if (!prev || r.reconciled_at > prev) out.set(r.bank_account_id, r.reconciled_at)
    }
  }
  return out
}
