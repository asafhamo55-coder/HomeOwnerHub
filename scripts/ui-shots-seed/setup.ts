import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeedContext } from '../ui-shots-seed'

const BARE_NAME = 'Bare Court HOA'
// BL-064: an association with no books, seen as an admin and as a board member.
const NO_BOOKS_ADMIN_NAME = 'Open Books Lane HOA'
const NO_BOOKS_BOARD_NAME = 'Board Books Lane HOA'

/**
 * A second HOA org the shots user belongs to, found by name or created.
 * Its membership is pinned to a late `joined_at` so the main demo org stays
 * the default (getCurrentOrg falls back to the first by joined_at, and
 * NULLs sort last). Shots reach it with the active-org cookie.
 */
async function extraOrg(
  db: SupabaseClient,
  ctx: SeedContext,
  name: string,
  role: 'admin' | 'board',
): Promise<string> {
  const { data: rows } = await db
    .from('org_members')
    .select('org_id, orgs!inner(hub_type, name)')
    .eq('user_id', ctx.userId)
    .eq('orgs.hub_type', 'hoa')
    .eq('orgs.name', name)
    .limit(1)
  const found = (rows?.[0] as { org_id?: string } | undefined)?.org_id ?? null
  if (found) {
    await db.from('org_members').update({ role }).eq('org_id', found).eq('user_id', ctx.userId)
    return found
  }
  const { data: org, error } = await db.from('orgs').insert({ name, hub_type: 'hoa' }).select('id').single()
  if (error || !org) throw new Error(`extra org insert: ${error?.code}`)
  const orgId = org.id as string
  const { error: mErr } = await db
    .from('org_members')
    .insert({ org_id: orgId, user_id: ctx.userId, role, joined_at: '2099-01-01T00:00:00Z' })
  if (mErr) throw new Error(`extra org membership: ${mErr.code}`)
  return orgId
}

/**
 * An association whose books were never opened: no funds, no chart of
 * accounts, no fiscal period. A previous run's "Open the books"
 * click-through is undone so the empty state always renders.
 */
async function associationWithoutBooks(db: SupabaseClient, orgId: string, name: string): Promise<void> {
  const { data: existing } = await db.from('associations').select('id').eq('organization_id', orgId).limit(1)
  let assocId = (existing?.[0] as { id?: string } | undefined)?.id ?? null
  if (!assocId) {
    const { data, error } = await db
      .from('associations')
      .insert({
        organization_id: orgId,
        name,
        state: 'FL',
        governing_law_state: 'FL',
        type: 'hoa',
        slug: name.replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`no-books association insert: ${error?.code}`)
    assocId = data.id as string
  }
  for (const table of ['fiscal_periods', 'chart_of_accounts', 'funds']) {
    const { error } = await db.from(table).delete().eq('association_id', assocId)
    if (error) throw new Error(`no-books reset ${table}: ${error.code}`)
  }
}

/**
 * BL-046: a second HOA org with NO association, for the "Set up your
 * association" empty state on /dues and /accounting.
 * BL-064: two more with an association but no books — "Open the books"
 * for an admin, "See your HOA's admins" for a board member.
 * Idempotent; invented data only.
 */
export async function seed_setup(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  await db
    .from('org_members')
    .update({ joined_at: '2000-01-01T00:00:00Z' })
    .eq('org_id', ctx.hoaOrgId)
    .eq('user_id', ctx.userId)

  const bareHoaOrgId = await extraOrg(db, ctx, BARE_NAME, 'admin')
  // Keep it bare: a previous run's click-through may have created one.
  await db.from('associations').delete().eq('organization_id', bareHoaOrgId)

  const noBooksAdminOrgId = await extraOrg(db, ctx, NO_BOOKS_ADMIN_NAME, 'admin')
  await associationWithoutBooks(db, noBooksAdminOrgId, NO_BOOKS_ADMIN_NAME)
  // A vendor, so /accounting/invoices/new gets past "Add a vendor first" to
  // the missing expense accounts.
  const vendorName = 'Sample Pool Service (demo)'
  const { data: v } = await db
    .from('vendors')
    .select('id')
    .eq('organization_id', noBooksAdminOrgId)
    .eq('legal_name', vendorName)
    .limit(1)
  if (!v?.length) {
    const { error } = await db
      .from('vendors')
      .insert({ organization_id: noBooksAdminOrgId, legal_name: vendorName, status: 'active', trades: ['pool'] })
    if (error) throw new Error(`no-books vendor insert: ${error.code}`)
  }
  const noBooksBoardOrgId = await extraOrg(db, ctx, NO_BOOKS_BOARD_NAME, 'board')
  await associationWithoutBooks(db, noBooksBoardOrgId, NO_BOOKS_BOARD_NAME)

  return { bareHoaOrgId, noBooksAdminOrgId, noBooksBoardOrgId }
}
