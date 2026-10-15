/**
 * F2: cross-tenant privilege escalation via org_members.
 *
 * scripts/test-inbox-rls.ts could never have caught this: every
 * assertion in it is a SELECT, and this is an INSERT.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { makeOrg, mintUser } from '../fixtures/factory'
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
