// B9 — reads for the per-vendor 1099-NEC summary. Server only.
// The tax ID is masked to its last four digits here, at the read; nothing
// downstream (page, CSV, logs) ever holds the full number.

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { chunk } from '@/lib/supabase/read-all'
import { queryFailed } from '../queries'
import { loadVendorPayments, type YearEndScope } from './load'
import { build1099Rows, form1099NecMinimumCents, tinLast4, type VendorAddress } from './form1099'

export async function load1099Summary(s: YearEndScope) {
  const db = await getSupabaseServerClient()
  const { nec, calendarYear } = await loadVendorPayments(db, s)
  const ids = nec.map((n) => n.vendorId).filter((v): v is string => v != null)
  const extra = new Map<string, { tinLast4: string | null; address: VendorAddress | null }>()
  for (const part of chunk(ids)) {
    const { data, error } = await db
      .from('vendors')
      .select('id, ein, address')
      .eq('organization_id', s.orgId)
      .in('id', part)
    if (error) throw queryFailed(error)
    for (const v of data ?? []) {
      extra.set(v.id, { tinLast4: tinLast4(v.ein), address: (v.address as VendorAddress | null) ?? null })
    }
  }
  return { calendarYear, rows: build1099Rows(nec, extra, form1099NecMinimumCents(calendarYear)) }
}
