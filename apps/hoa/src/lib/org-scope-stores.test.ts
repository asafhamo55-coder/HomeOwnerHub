import { describe, expect, it } from 'vitest'
import { fakeSupabase, hasEq } from './test-utils/fake-supabase'
import { getBallot, listBallots, myVoterHomes, type BallotClient } from './online-voting/store'
import { getPoll, listPolls } from './polls/store'
import type { PollsClient } from './polls/store'

// The board screens pass the ACTIVE org to the ballot and poll stores; row
// level security alone would list every org the person belongs to.

describe('ballots', () => {
  it('list: org filter only when asked, so resident callers are unchanged', async () => {
    const a = fakeSupabase()
    await listBallots(a.client as unknown as BallotClient, undefined, undefined, 'org-A')
    expect(hasEq(a.queries[0], 'organization_id', 'org-A')).toBe(true)
    const b = fakeSupabase()
    await listBallots(b.client as unknown as BallotClient)
    expect(b.queries[0].ops.some(([m, c]) => m === 'eq' && c === 'organization_id')).toBe(false)
  })
  it('one ballot by id', async () => {
    const a = fakeSupabase()
    await getBallot(a.client as unknown as BallotClient, 'b-1', undefined, 'org-A')
    expect(hasEq(a.queries[0], 'id', 'b-1')).toBe(true)
    expect(hasEq(a.queries[0], 'organization_id', 'org-A')).toBe(true)
  })
})

describe('polls', () => {
  it('list and one poll', async () => {
    const a = fakeSupabase()
    await listPolls(a.client as unknown as PollsClient, undefined, 'org-A')
    expect(hasEq(a.queries[0], 'organization_id', 'org-A')).toBe(true)
    const b = fakeSupabase()
    await getPoll(b.client as unknown as PollsClient, 'p-1', 'org-A')
    expect(hasEq(b.queries[0], 'id', 'p-1')).toBe(true)
    expect(hasEq(b.queries[0], 'organization_id', 'org-A')).toBe(true)
  })
})

describe('myVoterHomes shows only the ballot’s own org homes', () => {
  it('filters the homes by the ballot’s org, not every org the owner is in', async () => {
    const { client, queries } = fakeSupabase((q) => {
      if (q.table === 'ballots') return { data: { organization_id: 'org-B' }, error: null }
      if (q.table === 'hoa_properties') return { data: [{ id: 'p-B', address: '1 B St' }], error: null }
      return undefined
    })
    const db = {
      ...client,
      rpc: async (fn: string) => ({ data: fn === 'ballot_voter_property_ids' ? ['p-A', 'p-B'] : [], error: null }),
    } as unknown as BallotClient
    const r = await myVoterHomes(db, 'b-1')
    expect(r.ok && r.data.map((h) => h.propertyId)).toEqual(['p-B'])
    const props = queries.find((q) => q.table === 'hoa_properties')!
    expect(hasEq(props, 'org_id', 'org-B')).toBe(true)
  })
})
