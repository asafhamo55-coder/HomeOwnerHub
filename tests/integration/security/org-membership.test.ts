/**
 * F2: cross-tenant privilege escalation via org_members.
 *
 * scripts/test-inbox-rls.ts could never have caught this: every
 * assertion in it is a SELECT, and this is an INSERT.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { adminDb, makeOrg, mintUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

describe('org_members INSERT scope', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('a member of one org cannot add themselves to another org', async () => {
    const orgA = await makeOrg()
    const orgB = await makeOrg()
    const boardA = await mintUser(orgA, 'board')

    const { error } = await boardA.client
      .from('org_members')
      .insert({ org_id: orgB.orgId, user_id: boardA.id, role: 'admin' })

    expect(error, 'a user joined a foreign org — RLS did not stop it').not.toBeNull()
  })

  it('and therefore cannot read the other org data', async () => {
    const orgA = await makeOrg()
    const orgB = await makeOrg()
    const boardA = await mintUser(orgA, 'board')

    await boardA.client
      .from('org_members')
      .insert({ org_id: orgB.orgId, user_id: boardA.id, role: 'admin' })

    // Positive proof first: the client can see its OWN org, so a zero
    // count below means the policy denied, not that everything is broken.
    const own = await boardA.client.from('orgs').select('id').eq('id', orgA.orgId)
    expect(own.data).toHaveLength(1)

    const foreign = await boardA.client.from('orgs').select('id').eq('id', orgB.orgId)
    // A permission-denied error also yields `data: null`, which `?? []`
    // would silently turn into an empty array indistinguishable from a
    // genuine RLS-filtered zero rows. Rule that out explicitly rather
    // than relying on the positive assertion above to catch it first.
    expect(foreign.error, 'expected a clean empty result, not a query error').toBeNull()
    expect(foreign.data ?? []).toHaveLength(0)
  })

  it('the inviting admin can still add a different user to their own org (production invite flow)', async () => {
    // Guards against over-correction. The founder/invite flow does NOT
    // use service-role for this insert: apps/hoa/src/lib/members.ts:277's
    // attachToOrg() inserts the invitee's org_members row through the
    // INVITING ADMIN's own RLS-enforcing client (getSupabaseServerClient()).
    // It only reaches for the admin client a few lines earlier, to upsert
    // the invitee's `profiles` row, with its own comment explaining why.
    //
    // This works post-0054 because org_member_access
    // (migrations/0000_schema.sql:402) has no explicit WITH CHECK, so its
    // USING expression — org_id = ANY(auth_org_ids()) — doubles as the
    // INSERT check, and the inviting admin already satisfies it for
    // their OWN org. A future tightening of org_member_access that
    // doesn't preserve this would silently break production invite
    // acceptance, which is exactly the scenario this test exists to catch.
    const orgA = await makeOrg()
    const throwaway = await makeOrg()
    const adminA = await mintUser(orgA, 'admin')
    // Minted in an unrelated org so this id is not already a member of
    // orgA — the shape attachToOrg() is called with for a brand-new invitee.
    const invitee = await mintUser(throwaway, 'resident')

    const { error } = await adminA.client
      .from('org_members')
      .insert({ org_id: orgA.orgId, user_id: invitee.id, role: 'resident' })

    expect(error, 'the production invite path (attachToOrg) would be broken').toBeNull()
  })
})

/**
 * Same-org role escalation (0058). Before 0058, org_member_access was a
 * single FOR ALL policy gated on org_id alone, so any member — a plain
 * resident included — could grant admin within their own org.
 *
 * An UPDATE or DELETE that RLS filters out returns no error and touches
 * zero rows, so every negative below re-reads the row as service role
 * rather than trusting the absence of an error.
 */
async function roleOf(orgId: string, userId: string): Promise<string | null> {
  const { data, error } = await adminDb()
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`roleOf: ${error.message}`)
  return data?.role ?? null
}

describe('org_members same-org role scope', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('a resident cannot promote themselves to admin', async () => {
    const orgA = await makeOrg()
    const resident = await mintUser(orgA, 'resident')

    await resident.client
      .from('org_members')
      .update({ role: 'admin' })
      .eq('org_id', orgA.orgId)
      .eq('user_id', resident.id)

    expect(await roleOf(orgA.orgId, resident.id)).toBe('resident')
  })

  it('a resident cannot add another user to their org as admin', async () => {
    const orgA = await makeOrg()
    const throwaway = await makeOrg()
    const resident = await mintUser(orgA, 'resident')
    const accomplice = await mintUser(throwaway, 'resident')

    const { error } = await resident.client
      .from('org_members')
      .insert({ org_id: orgA.orgId, user_id: accomplice.id, role: 'admin' })

    expect(error, 'a resident granted admin in their own org').not.toBeNull()
    expect(await roleOf(orgA.orgId, accomplice.id)).toBeNull()
  })

  it('a resident cannot invite anyone, even as a resident', async () => {
    const orgA = await makeOrg()
    const throwaway = await makeOrg()
    const resident = await mintUser(orgA, 'resident')
    const other = await mintUser(throwaway, 'resident')

    const { error } = await resident.client
      .from('org_members')
      .insert({ org_id: orgA.orgId, user_id: other.id, role: 'resident' })

    expect(error).not.toBeNull()
  })

  it('a board member cannot promote themselves to admin', async () => {
    const orgA = await makeOrg()
    const board = await mintUser(orgA, 'board')

    await board.client
      .from('org_members')
      .update({ role: 'admin' })
      .eq('org_id', orgA.orgId)
      .eq('user_id', board.id)

    expect(await roleOf(orgA.orgId, board.id)).toBe('board')
  })

  it('a board member cannot grant admin to a new user', async () => {
    const orgA = await makeOrg()
    const throwaway = await makeOrg()
    const board = await mintUser(orgA, 'board')
    const other = await mintUser(throwaway, 'resident')

    const { error } = await board.client
      .from('org_members')
      .insert({ org_id: orgA.orgId, user_id: other.id, role: 'admin' })

    expect(error, 'a board member granted admin').not.toBeNull()
  })

  it('a board member cannot promote a resident to admin', async () => {
    const orgA = await makeOrg()
    const board = await mintUser(orgA, 'board')
    const resident = await mintUser(orgA, 'resident')

    await board.client
      .from('org_members')
      .update({ role: 'admin' })
      .eq('org_id', orgA.orgId)
      .eq('user_id', resident.id)

    expect(await roleOf(orgA.orgId, resident.id)).toBe('resident')
  })

  it('a board member cannot remove an admin', async () => {
    const orgA = await makeOrg()
    const board = await mintUser(orgA, 'board')
    const admin = await mintUser(orgA, 'admin')

    await board.client
      .from('org_members')
      .delete()
      .eq('org_id', orgA.orgId)
      .eq('user_id', admin.id)

    expect(await roleOf(orgA.orgId, admin.id)).toBe('admin')
  })

  it('a board member can still invite and remove a resident (members.ts invite flow)', async () => {
    const orgA = await makeOrg()
    const throwaway = await makeOrg()
    const board = await mintUser(orgA, 'board')
    const invitee = await mintUser(throwaway, 'resident')

    const ins = await board.client
      .from('org_members')
      .insert({ org_id: orgA.orgId, user_id: invitee.id, role: 'resident' })
    expect(ins.error, 'board can no longer invite residents').toBeNull()
    expect(await roleOf(orgA.orgId, invitee.id)).toBe('resident')

    const del = await board.client
      .from('org_members')
      .delete()
      .eq('org_id', orgA.orgId)
      .eq('user_id', invitee.id)
    expect(del.error).toBeNull()
    expect(await roleOf(orgA.orgId, invitee.id)).toBeNull()
  })

  it('a resident cannot remove another member', async () => {
    const orgA = await makeOrg()
    const resident = await mintUser(orgA, 'resident')
    const neighbour = await mintUser(orgA, 'resident')

    await resident.client
      .from('org_members')
      .delete()
      .eq('org_id', orgA.orgId)
      .eq('user_id', neighbour.id)

    expect(await roleOf(orgA.orgId, neighbour.id)).toBe('resident')
  })

  it('an admin can promote, demote and remove members', async () => {
    const orgA = await makeOrg()
    const admin = await mintUser(orgA, 'admin')
    const resident = await mintUser(orgA, 'resident')

    const up = await admin.client
      .from('org_members')
      .update({ role: 'admin' })
      .eq('org_id', orgA.orgId)
      .eq('user_id', resident.id)
    expect(up.error).toBeNull()
    expect(await roleOf(orgA.orgId, resident.id)).toBe('admin')

    const down = await admin.client
      .from('org_members')
      .update({ role: 'board' })
      .eq('org_id', orgA.orgId)
      .eq('user_id', resident.id)
    expect(down.error).toBeNull()
    expect(await roleOf(orgA.orgId, resident.id)).toBe('board')

    const del = await admin.client
      .from('org_members')
      .delete()
      .eq('org_id', orgA.orgId)
      .eq('user_id', resident.id)
    expect(del.error).toBeNull()
    expect(await roleOf(orgA.orgId, resident.id)).toBeNull()
  })

  it('every member can still read the member list of their own org', async () => {
    const orgA = await makeOrg()
    const resident = await mintUser(orgA, 'resident')
    await mintUser(orgA, 'admin')

    const { data, error } = await resident.client
      .from('org_members')
      .select('user_id')
      .eq('org_id', orgA.orgId)
    expect(error).toBeNull()
    expect(data).toHaveLength(2)
  })
})
