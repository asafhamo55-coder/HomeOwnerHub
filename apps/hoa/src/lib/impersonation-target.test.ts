import { describe, expect, it } from 'vitest'
import { exactIlike, resolveImpersonationTarget } from './impersonation-target'
import { fakeSupabase, filterOn, hasEq, type Recorded } from './test-utils/fake-supabase'

const ORG_A = 'org-a'
const ORG_B = 'org-b'

// A tiny "database": rows per table, each tagged with its org. The fake
// answers a query by applying the eq/ilike/is filters it recorded, so a
// missing org filter shows up as a cross-org row leaking through.
type Row = Record<string, unknown>
const DB: Record<string, Row[]> = {
  units: [
    { id: 'unit-a', organization_id: ORG_A },
    { id: 'unit-b', organization_id: ORG_B },
  ],
  ownerships: [
    { id: 'o-a', organization_id: ORG_A, unit_id: 'unit-a', owner_user_id: 'owner-a', owner_email: 'owner-a@x.test', valid_to: null, valid_from: '2024-01-01' },
    { id: 'o-b', organization_id: ORG_B, unit_id: 'unit-b', owner_user_id: 'owner-b', owner_email: 'owner-b@x.test', valid_to: null, valid_from: '2024-01-01' },
  ],
  property_residents: [
    { id: 'r-b', organization_id: ORG_B, email: 'res_b@x.test', moved_out_at: null, deleted_at: null },
  ],
  hoa_properties: [],
  profiles: [
    { id: 'owner-a', email: 'owner-a@x.test' },
    { id: 'owner-b', email: 'owner-b@x.test' },
    { id: 'resxb', email: 'resxb@x.test' },
  ],
}

function likeToRegex(pattern: string): RegExp {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!
    if (c === '\\') {
      re += (pattern[++i] ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    } else if (c === '%') re += '.*'
    else if (c === '_') re += '.'
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`, 'i')
}

function answer(q: Recorded) {
  let rows = DB[q.table] ?? []
  for (const [m, col, val] of q.ops) {
    if (m === 'eq') rows = rows.filter((r) => r[col as string] === val)
    if (m === 'is') rows = rows.filter((r) => (r[col as string] ?? null) === val)
    if (m === 'ilike') rows = rows.filter((r) => likeToRegex(val as string).test(String(r[col as string] ?? '')))
    if (m === 'not') rows = rows.filter((r) => r[col as string] != null)
  }
  return { data: rows, error: null }
}

function db() {
  return fakeSupabase(answer)
}

describe('exactIlike', () => {
  it('escapes LIKE wildcards so they match literally', () => {
    expect(exactIlike('%')).toBe('\\%')
    expect(exactIlike(' A_B@X.test ')).toBe('a\\_b@x.test')
  })
})

describe('resolveImpersonationTarget — confined to the admin org', () => {
  it('accepts an owner of a unit in the admin org and resolves their uid', async () => {
    const { client } = db()
    const res = await resolveImpersonationTarget(client as never, ORG_A, {
      email: 'Owner-A@x.test',
      unitId: 'unit-a',
    })
    expect(res).toEqual({ ok: true, userId: 'owner-a', email: 'owner-a@x.test' })
  })

  it('refuses a unit belonging to another org', async () => {
    const { client } = db()
    const res = await resolveImpersonationTarget(client as never, ORG_A, {
      email: 'owner-b@x.test',
      unitId: 'unit-b',
    })
    expect(res).toEqual({ ok: false, reason: 'unit_not_in_org' })
  })

  it('refuses an explicit ownerUserId with no ownership in the admin org', async () => {
    const { client } = db()
    const res = await resolveImpersonationTarget(client as never, ORG_A, {
      email: 'owner-a@x.test',
      ownerUserId: 'owner-b',
    })
    expect(res).toEqual({ ok: false, reason: 'owner_not_in_org' })
  })

  it('refuses an email only linked in another org', async () => {
    const { client } = db()
    const res = await resolveImpersonationTarget(client as never, ORG_A, { email: 'owner-b@x.test' })
    expect(res).toEqual({ ok: false, reason: 'email_not_in_org' })
  })

  it('`%` never matches another user', async () => {
    const { client, queries } = db()
    const res = await resolveImpersonationTarget(client as never, ORG_A, { email: '%@%.%' })
    expect(res.ok).toBe(false)
    for (const q of queries.filter((q) => q.ops.some(([m]) => m === 'ilike'))) {
      const [pattern] = q.ops.find(([m]) => m === 'ilike')!.slice(2) as [string]
      expect(pattern).not.toMatch(/(^|[^\\])[%_]/)
    }
  })

  it('`_` never matches a different address (resxb vs res_b)', async () => {
    // res_b@x.test is a resident of org B only; resxb@x.test exists as a
    // profile. An unescaped `_` would let `res_b` hit `resxb`.
    const { client } = db()
    const res = await resolveImpersonationTarget(client as never, ORG_B, { email: 'res_b@x.test' })
    expect(res).toEqual({ ok: true, userId: null, email: 'res_b@x.test' })
  })

  it('every lookup that can name a person carries the org filter', async () => {
    const { client, queries } = db()
    await resolveImpersonationTarget(client as never, ORG_A, { email: 'owner-a@x.test', unitId: 'unit-a' })
    for (const q of queries) {
      if (q.table === 'profiles') continue // keyed by exact address, adopted only after an org link
      const orgCol = q.table === 'hoa_properties' ? 'org_id' : 'organization_id'
      expect(hasEq(q, orgCol, ORG_A), `${q.table} query lacks org filter`).toBe(true)
    }
    expect(filterOn(queries.find((q) => q.table === 'units')!, 'eq', 'id')).toEqual(['unit-a'])
  })
})
