/**
 * Admin "enter owner portal" target resolution is confined to the admin's
 * org (P0 hotfix). enterResidentPortal is a server action, so its unitId /
 * ownerUserId / email arguments are attacker-controlled; an admin of org A
 * (anyone can become one through onboarding) used to be able to point the
 * service-role portal at an owner in org B, or at `%`.
 *
 * resolveImpersonationTarget runs with the SERVICE-ROLE client in prod,
 * so RLS does not help here — the org boundary is entirely in its queries.
 * This test therefore runs it through adminDb() on purpose, against real
 * Postgres LIKE semantics (escape handling included).
 *
 * Fixture rule: fresh orgs per run, no truncateAll.
 */
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { resolveImpersonationTarget } from '../../../apps/hoa/src/lib/impersonation-target'
import { adminDb, makeOrg, makeUnit, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'

interface World {
  orgA: OrgFixture
  orgB: OrgFixture
  ownerA: TestUser
  ownerB: TestUser
  unitA: string
  unitB: string
  /** Email-only resident of org B whose address contains `_`. */
  underscoreEmail: string
  /** A profile whose address the `_` would match if unescaped. */
  lookalike: TestUser
}

let w: World

beforeAll(async () => {
  const db = adminDb()
  const orgA = await makeOrg()
  const orgB = await makeOrg()
  const unitA = await makeUnit(orgA)
  const unitB = await makeUnit(orgB)
  const ownerA = await mintUser(orgA, 'resident')
  const ownerB = await mintUser(orgB, 'resident')
  const lookalike = await mintUser(orgB, 'resident')

  for (const [org, unit, user] of [
    [orgA, unitA, ownerA],
    [orgB, unitB, ownerB],
  ] as const) {
    const { error } = await db.from('ownerships').insert({
      organization_id: org.orgId,
      unit_id: unit,
      owner_user_id: user.id,
      owner_email: user.email,
      valid_from: '2024-01-01',
    })
    if (error) throw new Error(`seed ownership: ${error.message}`)
  }

  // `_` in an address must match only that literal character.
  const tag = randomUUID().slice(0, 8)
  const underscoreEmail = `res_${tag}@example.test`
  const { error: profErr } = await db
    .from('profiles')
    .update({ email: `resX${tag}@example.test` })
    .eq('id', lookalike.id)
  if (profErr) throw new Error(`seed lookalike: ${profErr.message}`)

  const { data: prop, error: propErr } = await db
    .from('hoa_properties')
    .insert({ org_id: orgB.orgId, address: `${tag} Underscore Way` })
    .select('id')
    .single()
  if (propErr || !prop) throw new Error(`seed property: ${propErr?.message}`)
  const { error: resErr } = await db.from('property_residents').insert({
    organization_id: orgB.orgId,
    property_id: prop.id,
    email: underscoreEmail,
    full_name: 'Underscore Resident',
    role: 'owner',
  })
  if (resErr) throw new Error(`seed resident: ${resErr.message}`)

  w = { orgA, orgB, ownerA, ownerB, unitA, unitB, underscoreEmail, lookalike }
})

describe('impersonation target resolution is org-confined', () => {
  it('resolves an owner of a unit in the admin org', async () => {
    const res = await resolveImpersonationTarget(adminDb(), w.orgA.orgId, {
      email: w.ownerA.email.toUpperCase(),
      unitId: w.unitA,
    })
    expect(res).toEqual({ ok: true, userId: w.ownerA.id, email: w.ownerA.email.toLowerCase() })
  })

  it('refuses a unit in another org', async () => {
    const res = await resolveImpersonationTarget(adminDb(), w.orgA.orgId, {
      email: w.ownerB.email,
      unitId: w.unitB,
    })
    expect(res.ok).toBe(false)
  })

  it('refuses an ownerUserId from another org', async () => {
    const res = await resolveImpersonationTarget(adminDb(), w.orgA.orgId, {
      email: w.ownerA.email,
      ownerUserId: w.ownerB.id,
    })
    expect(res.ok).toBe(false)
  })

  it('refuses an email that is only linked in another org', async () => {
    const res = await resolveImpersonationTarget(adminDb(), w.orgA.orgId, { email: w.ownerB.email })
    expect(res.ok).toBe(false)
  })

  it.each(['%', '%@%.%', '%@example.test', '_%@example.test'])(
    'wildcard address %s matches nobody',
    async (email) => {
      const res = await resolveImpersonationTarget(adminDb(), w.orgB.orgId, { email })
      expect(res.ok).toBe(false)
    },
  )

  it('`_` matches only itself: the lookalike profile is never adopted', async () => {
    const res = await resolveImpersonationTarget(adminDb(), w.orgB.orgId, { email: w.underscoreEmail })
    expect(res).toEqual({ ok: true, userId: null, email: w.underscoreEmail })
  })
})
