// BL-048 — rejecting a vendor prospect. The vendor module's server action
// (rejectVendor in lib/vendors.ts) gates and calls this; /approvals
// dispatches to that action.
//
// A rejected prospect becomes 'inactive' (vendors.status CHECK: prospect |
// active | inactive | blacklisted — 'blacklisted' is a stronger statement
// than "not approved now"). Only a live prospect can be rejected here: an
// active vendor with compliance gaps is changed from its own page. The
// update is conditional on status = 'prospect', so a vendor approved a
// moment ago is not silently deactivated.
//
// The reason goes to audit_log (best effort, like the manual compliance
// override) — vendors has no column for it, and no migration is added.
//
// Pure: takes the caller's RLS client; no Next, no `@/` imports.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'

export type VendorDecisionDb = SupabaseClient<Database>

export async function rejectProspectVendor(
  db: VendorDecisionDb,
  args: { orgId: string; vendorId: string; userId: string; role: 'admin' | 'board'; reason: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { orgId, vendorId, userId, role, reason } = args
  const { data, error } = await db
    .from('vendors')
    .update({ status: 'inactive' })
    .eq('id', vendorId)
    .eq('organization_id', orgId)
    .eq('status', 'prospect')
    .is('deleted_at', null)
    .select('id')
  if (error) {
    console.error('rejectVendor failed', { vendorId, code: error.code })
    return { ok: false, error: 'Couldn’t reject the vendor. Try again.' }
  }
  if (!data || data.length === 0) {
    return { ok: false, error: 'This vendor is no longer a prospect. Open the vendor to change its status.' }
  }

  try {
    const { error: auditError } = await db.from('audit_log').insert({
      org_id: orgId,
      user_id: userId,
      action: 'vendor.rejected',
      entity_type: 'vendor',
      entity_id: vendorId,
      metadata: { reason, actor_role: role, previous_status: 'prospect' },
    })
    if (auditError) console.error('rejectVendor audit failed', { vendorId, code: auditError.code })
  } catch {
    console.error('rejectVendor audit failed', { vendorId, code: 'thrown' })
  }
  return { ok: true }
}
