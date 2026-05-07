import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface CurrentOrg {
  id: string
  name: string
  hub_type: string
  plan: string
  doors_count: number | null
}

// Phase 1 assumes a user belongs to exactly one HOA org. We pick the first
// org_members row, scoped to hub_type='hoa', so a user who also has eviction
// or pm orgs doesn't see them in this app.
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
    if (org && org.hub_type === 'hoa') return org
  }
  return null
}
