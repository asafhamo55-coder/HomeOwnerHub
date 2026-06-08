'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'
import { fetchBoardMembers } from './audience'

type ActionResult = { ok: true } | { ok: false; error: string }

// ─── Per-property resident lookup (powers the "Specific property"
//     audience option in the new-communication wizard) ────────────────

export interface ResidentOption {
  id: string
  fullName: string
  email: string | null
  phone: string | null
  role: 'owner' | 'tenant' | 'family_member' | 'other'
  isPrimary: boolean
}

/**
 * Returns active (not moved-out) residents at a property — the
 * data behind the resident checkboxes in the new-message wizard
 * once the sender picks a property. Sorted: primaries first, then by
 * role (owners → tenants → family → other), then alphabetically.
 *
 * Org-scoped via the active org cookie. Returns [] if the property
 * doesn't belong to the current org (no error surfacing — we don't
 * want to leak whether a property id exists in another tenant).
 */
export async function listPropertyResidents(
  propertyId: string,
): Promise<ResidentOption[]> {
  const org = await getCurrentOrg()
  if (!org) return []

  const supabase = await getSupabaseServerClient()

  // Confirm the property belongs to this org before reading residents.
  const { data: prop } = await supabase
    .from('hoa_properties')
    .select('id')
    .eq('id', propertyId)
    .eq('org_id', org.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!prop) return []

  const { data } = await supabase
    .from('property_residents' as never)
    .select('id, full_name, email, phone, role, is_primary')
    .eq('property_id', propertyId)
    .is('moved_out_at', null)
    .order('is_primary', { ascending: false })
    .order('role')
    .order('full_name')

  type Row = {
    id: string
    full_name: string | null
    email: string | null
    phone: string | null
    role: string | null
    is_primary: boolean | null
  }
  const rows = (data ?? []) as unknown as Row[]
  return rows.map((r) => ({
    id: r.id,
    fullName: r.full_name ?? '(no name)',
    email: r.email,
    phone: r.phone,
    role: (r.role as ResidentOption['role']) ?? 'other',
    isPrimary: r.is_primary ?? false,
  }))
}

// ─── Board-member lookup (powers the "Board" audience option) ─────────

export interface BoardMemberOption {
  userId: string
  fullName: string
  email: string | null
  role: 'board' | 'admin'
}

/**
 * Board + admin members of the current org — the data behind the board
 * checkboxes in the pickers. Board members are checked by default; admins
 * are offered as an opt-in extra (the picker leaves them unchecked).
 * Org-scoped via the active org cookie; returns [] when no org is
 * selected. Reads run through the service-role client inside
 * fetchBoardMembers (profiles RLS blocks the user-bound client from
 * seeing other members' emails).
 */
export async function listBoardMembers(): Promise<BoardMemberOption[]> {
  const org = await getCurrentOrg()
  if (!org) return []
  const members = await fetchBoardMembers(org.id, ['board', 'admin'])
  return members.map((m) => ({
    userId: m.userId,
    fullName: m.fullName,
    email: m.email,
    role: m.role,
  }))
}

export async function deleteCommunication(
  commId: string,
): Promise<ActionResult> {
  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()

  const { data: comm } = await supabase
    .from('communications')
    .select('id, status')
    .eq('id', commId)
    .eq('association_id', assoc.id)
    .maybeSingle()
  if (!comm) return { ok: false, error: 'Communication not found.' }

  if (comm.status === 'sending') {
    return { ok: false, error: 'Cannot delete a communication that is currently being sent.' }
  }

  const { error } = await supabase
    .from('communications')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', commId)
    .is('deleted_at', null)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/communications')
  return { ok: true }
}
