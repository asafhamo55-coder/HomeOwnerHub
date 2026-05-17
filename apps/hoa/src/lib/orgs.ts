import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface CurrentOrg {
  id: string
  name: string
  hub_type: string
  plan: string
  doors_count: number | null
}

export interface UserHub {
  type: 'hoa' | 'eviction' | 'pm'
  orgName: string
}

export interface UserHoaOrg {
  id: string
  name: string
  doors_count: number | null
}

export const ACTIVE_ORG_COOKIE = 'hoa_active_org_id'

// Resolution order for the active HOA org:
//   1. Cookie `hoa_active_org_id` (set by the switcher), iff the user is
//      a member of that org and it's an HOA hub.
//   2. First HOA org by `joined_at` ascending (legacy default).
// Returns null if the user has no HOA org membership.
export async function getCurrentOrg(): Promise<CurrentOrg | null> {
  const supabase = await getSupabaseServerClient()

  const { data, error } = await supabase
    .from('org_members')
    .select('org:orgs(id, name, hub_type, plan, doors_count)')
    .order('joined_at', { ascending: true })
    .limit(20)
  if (error || !data) return null

  const hoaOrgs: CurrentOrg[] = []
  for (const row of data) {
    const org = row.org as CurrentOrg | null
    if (org && org.hub_type === 'hoa') hoaOrgs.push(org)
  }
  if (hoaOrgs.length === 0) return null

  const cookieStore = await cookies()
  const wanted = cookieStore.get(ACTIVE_ORG_COOKIE)?.value
  if (wanted) {
    const match = hoaOrgs.find((o) => o.id === wanted)
    if (match) return match
    // Cookie points to an org the user no longer has access to — ignore
    // and fall through. The next setActiveOrg call will replace it.
  }
  return hoaOrgs[0]
}

// All HOA orgs the user belongs to. Powers the in-app org switcher.
export async function getUserHoaOrgs(): Promise<UserHoaOrg[]> {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('org_members')
    .select('org:orgs(id, name, hub_type, doors_count)')
    .order('joined_at', { ascending: true })
    .limit(20)
  if (error || !data) return []

  const seen = new Set<string>()
  const out: UserHoaOrg[] = []
  for (const row of data) {
    const org = row.org as
      | { id: string; name: string; hub_type: string; doors_count: number | null }
      | null
    if (!org || org.hub_type !== 'hoa' || seen.has(org.id)) continue
    seen.add(org.id)
    out.push({ id: org.id, name: org.name, doors_count: org.doors_count })
  }
  return out
}

// All hubs the user has any org in. Powers the cross-app hub switcher.
export async function getUserHubs(): Promise<UserHub[]> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('org_members')
    .select('org:orgs(hub_type, name)')
    .order('joined_at', { ascending: true })
    .limit(20)

  const seen = new Set<string>()
  const hubs: UserHub[] = []
  for (const row of data ?? []) {
    const org = row.org as { hub_type: string; name: string } | null
    if (!org || seen.has(org.hub_type)) continue
    if (org.hub_type === 'hoa' || org.hub_type === 'eviction' || org.hub_type === 'pm') {
      seen.add(org.hub_type)
      hubs.push({ type: org.hub_type, orgName: org.name })
    }
  }
  return hubs
}
