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
    expect(foreign.data ?? []).toHaveLength(0)
  })

  it('a member can still be added to their own org by a service-role caller', async () => {
    // Guards against over-correction: the founder/invite flow uses
    // service-role and must keep working.
    const orgA = await makeOrg()
    const user = await mintUser(orgA, 'resident')
    expect(user.id).toBeTruthy()
  })
})
