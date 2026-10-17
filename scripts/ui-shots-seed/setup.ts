import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeedContext } from '../ui-shots-seed'

const BARE_NAME = 'Bare Court HOA'

/**
 * BL-046: a second HOA org with NO association, for the "Set up your
 * association" empty state on /dues and /accounting. Shots reach it with
 * the active-org cookie (`org: 'bareHoaOrgId'`), so the main demo org stays
 * the default: its membership is pinned to an early `joined_at` and this
 * one to a late one (getCurrentOrg falls back to the first by joined_at,
 * and NULLs sort last). Idempotent; invented data only.
 */
export async function seed_setup(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  await db
    .from('org_members')
    .update({ joined_at: '2000-01-01T00:00:00Z' })
    .eq('org_id', ctx.hoaOrgId)
    .eq('user_id', ctx.userId)

  const { data: rows } = await db
    .from('org_members')
    .select('org_id, orgs!inner(hub_type, name)')
    .eq('user_id', ctx.userId)
    .eq('orgs.hub_type', 'hoa')
    .eq('orgs.name', BARE_NAME)
    .limit(1)
  let orgId = (rows?.[0] as { org_id?: string } | undefined)?.org_id ?? null
  if (!orgId) {
    const { data: org, error } = await db.from('orgs').insert({ name: BARE_NAME, hub_type: 'hoa' }).select('id').single()
    if (error || !org) throw new Error(`bare org insert: ${error?.code}`)
    orgId = org.id as string
    const { error: mErr } = await db
      .from('org_members')
      .insert({ org_id: orgId, user_id: ctx.userId, role: 'admin', joined_at: '2099-01-01T00:00:00Z' })
    if (mErr) throw new Error(`bare org membership: ${mErr.code}`)
  }
  // Keep it bare: a previous run's click-through may have created one.
  await db.from('associations').delete().eq('organization_id', orgId)
  return { bareHoaOrgId: orgId }
}
