import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface CurrentOrg {
  id: string
  name: string
  hub_type: string
  plan: string
  doors_count: number | null
}

// Filter to hub_type='pm' so a user with HOA + eviction orgs doesn't get
// the wrong workspace here.
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
    if (org && org.hub_type === 'pm') return org
  }
  return null
}
