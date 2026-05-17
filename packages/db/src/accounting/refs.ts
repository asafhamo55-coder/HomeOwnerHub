import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../database.types'

/**
 * Resolves well-known account/fund IDs by code for one association.
 * Used by every code path that needs to post a journal entry — server
 * actions in the HOA app, Inngest jobs, and webhook handlers.
 *
 * Returns null when any required reference is missing; that almost
 * always means `pnpm seed:accounting` hasn't run for this association.
 * Callers surface this as a "Run setup first" error rather than 500ing.
 */
export interface AccountingRefs {
  fundOperating: string
  fundReserve: string
  acctCashOperating: string
  acctAR: string
  acctAP: string
  acctAssessmentIncome: string
  acctLateFeeIncome: string
}

export async function loadAccountingRefs(
  supabase: SupabaseClient<Database>,
  associationId: string,
): Promise<AccountingRefs | null> {
  const [funds, accounts] = await Promise.all([
    supabase
      .from('funds')
      .select('id, code')
      .eq('association_id', associationId)
      .in('code', ['OPERATING', 'RESERVE']),
    supabase
      .from('chart_of_accounts')
      .select('id, account_number')
      .eq('association_id', associationId)
      .in('account_number', ['1010', '1100', '2010', '4000', '4100']),
  ])

  const fundByCode = new Map<string, string>(
    (funds.data ?? []).map((r) => [r.code, r.id]),
  )
  const acctByNumber = new Map<string, string>(
    (accounts.data ?? []).map((r) => [r.account_number, r.id]),
  )

  const refs = {
    fundOperating: fundByCode.get('OPERATING'),
    fundReserve: fundByCode.get('RESERVE'),
    acctCashOperating: acctByNumber.get('1010'),
    acctAR: acctByNumber.get('1100'),
    acctAP: acctByNumber.get('2010'),
    acctAssessmentIncome: acctByNumber.get('4000'),
    acctLateFeeIncome: acctByNumber.get('4100'),
  }
  if (Object.values(refs).some((v) => v === undefined)) return null
  return refs as AccountingRefs
}
