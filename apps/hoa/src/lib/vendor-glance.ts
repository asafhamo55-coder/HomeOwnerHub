import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { GlanceBid } from '@/components/vendors/glance'

/**
 * The one lean read behind the vendor header: this vendor's bids with the
 * parent RFP status, org-scoped. Tickets and contracts have no vendor link
 * in the schema, so they are not counted. A failed read returns null so the
 * header can say "unavailable" instead of showing false zeros.
 */
export async function loadVendorBids(vendorId: string): Promise<GlanceBid[] | null> {
  const org = await getCurrentOrg()
  if (!org) return []
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('bids' as never)
    .select('status, rfp_id, submitted_at, rfps(status)')
    .eq('organization_id', org.id)
    .eq('vendor_id', vendorId)
    .limit(200)
  if (error) {
    console.error('loadVendorBids failed', { code: error.code, message: error.message })
    return null
  }
  type Rfp = { status: string }
  type Row = { status: string; rfp_id: string; submitted_at: string | null; rfps: Rfp | Rfp[] | null }
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const rfp = Array.isArray(r.rfps) ? r.rfps[0] : r.rfps
    return { status: r.status, rfp_id: r.rfp_id, submitted_at: r.submitted_at, rfp_status: rfp?.status ?? null }
  })
}
