import { beforeEach, describe, expect, it } from 'vitest'
import { adminDb, makeAccounting, makeOrg, makeUnit, mintUser } from './factory'
import { truncateAll } from './truncate'

describe('fixture factory', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('makeOrg creates an hoa org with an association', async () => {
    const f = await makeOrg()
    expect(f.orgId).toMatch(/^[0-9a-f-]{36}$/)
    expect(f.associationId).toMatch(/^[0-9a-f-]{36}$/)

    const { data } = await adminDb().from('orgs').select('id, hub_type').eq('id', f.orgId).single()
    expect(data?.hub_type).toBe('hoa')
  })

  it('makeOrg produces isolated orgs on repeat calls', async () => {
    const a = await makeOrg()
    const b = await makeOrg()
    expect(a.orgId).not.toBe(b.orgId)
  })

  it('makeAccounting creates both funds, the full COA, and an open period', async () => {
    const f = await makeOrg()
    const refs = await makeAccounting(f)

    expect(Object.keys(refs.fundIds).sort()).toEqual(['OPERATING', 'RESERVE'])
    // The 25-row DEFAULT_COA from scripts/seed-accounting.ts.
    expect(Object.keys(refs.accountIds).length).toBe(25)
    // Accounts the accounting harnesses specifically require.
    for (const n of ['1010', '1020', '1100', '2010', '3000', '4000', '4100']) {
      expect(refs.accountIds[n], `account ${n} missing`).toBeTruthy()
    }
    // At least one expense account (5xxx) — test-ap and test-reports-close need it.
    expect(Object.keys(refs.accountIds).some((n) => n.startsWith('5'))).toBe(true)

    const { data } = await adminDb()
      .from('fiscal_periods').select('status').eq('id', refs.fiscalPeriodId).single()
    expect(data?.status).toBe('open')
  })

  it('mintUser returns a client whose auth.uid() is populated', async () => {
    const f = await makeOrg()
    const user = await mintUser(f, 'board')

    const { data } = await user.client.auth.getUser()
    expect(data.user?.id).toBe(user.id)
  })

  it('mintUser client is RLS-scoped to its own org', async () => {
    const orgA = await makeOrg()
    const orgB = await makeOrg()
    const boardA = await mintUser(orgA, 'board')

    // Positive proof FIRST. Without it, a broken deny-all policy would
    // satisfy the negative below and the test would prove nothing.
    const mine = await boardA.client.from('orgs').select('id').eq('id', orgA.orgId)
    expect(mine.error).toBeNull()
    expect(mine.data).toHaveLength(1)

    const theirs = await boardA.client.from('orgs').select('id').eq('id', orgB.orgId)
    expect(theirs.error).toBeNull()
    expect(theirs.data).toHaveLength(0)
  })

  it('makeUnit attaches a unit to the association', async () => {
    const f = await makeOrg()
    const unitId = await makeUnit(f)
    const { data } = await adminDb()
      .from('units').select('association_id').eq('id', unitId).single()
    expect(data?.association_id).toBe(f.associationId)
  })
})
