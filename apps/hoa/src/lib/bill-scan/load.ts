// BL-059 — server-side reads for editing a scanned bill: the vendors and
// expense accounts a corrected bill may use (the same lists the upload route
// offered the model), the association's today, and the duplicate check the
// executor also runs. Takes the caller's client; RLS scopes it.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { todayIn } from '@/lib/association-time'
import { associationTimeZoneById } from '@/lib/association-time-server'
import { readAllResult } from '@/lib/supabase/read-all'
import { logRouteFailure } from '@/lib/api/log'
import type { AccountCandidate, VendorCandidate } from './proposal'

type Db = SupabaseClient<Database>

export type BillEditOptions = { ok: true; vendors: VendorCandidate[]; accounts: AccountCandidate[]; today: string } | { ok: false }

export async function loadBillEditOptions(db: Db, orgId: string, associationId: string): Promise<BillEditOptions> {
  const { data: assoc, error: assocErr } = await db
    .from('associations')
    .select('id')
    .eq('id', associationId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (assocErr || !assoc) {
    if (assocErr) logRouteFailure('bill-scan.edit-options.association', assocErr, { orgId })
    return { ok: false }
  }
  const [accountsRes, vendorsRes, zone] = await Promise.all([
    readAllResult<{ id: string; account_number: string; account_name: string }>((from, to) =>
      db
        .from('chart_of_accounts')
        .select('id, account_number, account_name')
        .eq('association_id', associationId)
        .eq('account_type', 'expense')
        .eq('is_active', true)
        .order('id')
        .range(from, to),
    ),
    readAllResult<{ id: string; legal_name: string; dba: string | null }>((from, to) =>
      db
        .from('vendors')
        .select('id, legal_name, dba')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .neq('status', 'blacklisted')
        .order('id')
        .range(from, to),
    ),
    associationTimeZoneById(db, associationId),
  ])
  if (accountsRes.error || vendorsRes.error) {
    logRouteFailure('bill-scan.edit-options', accountsRes.error ?? vendorsRes.error, { orgId })
    return { ok: false }
  }
  return {
    ok: true,
    accounts: (accountsRes.data ?? [])
      .map((a) => ({ id: a.id, accountNumber: a.account_number, accountName: a.account_name }))
      .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber)),
    vendors: (vendorsRes.data ?? [])
      .map((v) => ({ id: v.id, legalName: v.legal_name, dba: v.dba }))
      .sort((a, b) => a.legalName.localeCompare(b.legalName)),
    today: todayIn(zone),
  }
}

/** A live (non-deleted) invoice with this vendor + number already exists. */
export async function billInvoiceExists(
  db: Db,
  vendorId: string,
  invoiceNumber: string,
): Promise<{ ok: true; exists: boolean } | { ok: false }> {
  const { count, error } = await db
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_id', vendorId)
    .eq('invoice_number', invoiceNumber)
    .is('deleted_at', null)
  return error ? { ok: false } : { ok: true, exists: (count ?? 0) > 0 }
}
