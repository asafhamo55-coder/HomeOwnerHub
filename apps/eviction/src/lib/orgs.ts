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

// A user can hold orgs across hubs (HOA + eviction + PM are independent
// orgs that share auth). This filter scopes to the current hub so the
// eviction app never picks up an HOA org and vice versa.
export async function getCurrentOrg(): Promise<CurrentOrg | null> {
  const supabase = await getSupabaseServerClient()

  const { data, error } = await supabase
    .from('org_members')
    .select('org:orgs(id, name, hub_type, plan, doors_count)')
    .order('joined_at', { ascending: true })
    .limit(10)

  if (error || !data) return null

  for (const row of data) {
    const org = row.org as CurrentOrg | null
    if (org && org.hub_type === 'eviction') return org
  }
  return null
}

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
