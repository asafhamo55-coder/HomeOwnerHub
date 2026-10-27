/**
 * BL-175b L1 + M6 (0070): the SECURITY DEFINER auth helpers give a caller with
 * no identity nothing. CI only (no local database).
 *
 * CI's schema replay re-grants EXECUTE on ALL ROUTINES to anon, so a REVOKE
 * in the migration is invisible here: the null-uid guard has to be in the
 * function BODY. Production keeps the REVOKE as well; there an anon call is
 * refused outright (42501), which these tests accept as equally safe.
 *
 * Also: every SECURITY DEFINER function in `public` pins its search_path
 * (a definer function without one resolves names through the caller's path).
 */
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { LOCAL_ANON_KEY, LOCAL_SUPABASE_URL } from '../setup/env'
import { adminDb, makeOrg, mintUser, type OrgFixture } from '../fixtures/factory'
import { psqlAsJwt, psqlRows } from '../fixtures/psql'
import { truncateAll } from '../fixtures/truncate'

const anon = () => createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

const ARRAY_HELPERS = ['auth_org_ids', 'auth_resident_unit_ids', 'auth_resident_property_ids', 'auth_owner_unit_ids'] as const
const BOOL_HELPERS: Array<[string, Record<string, unknown>]> = [
  ['auth_is_admin', { p_org_id: randomUUID() }],
  ['auth_is_board_or_admin', { p_org_id: randomUUID() }],
  ['auth_is_platform_admin', {}],
]

let org: OrgFixture

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
})

describe('0070 L1: anon gets empty / false from every definer helper', () => {
  for (const fn of ARRAY_HELPERS) {
    it(`${fn}() as anon: empty (or refused)`, async () => {
      const { data, error } = await anon().rpc(fn as never)
      if (error) expect(error.code).toBe('42501')
      else expect(data).toEqual([])
    })
  }
  for (const [fn, args] of BOOL_HELPERS) {
    it(`${fn}() as anon: false (or refused)`, async () => {
      const { data, error } = await anon().rpc(fn as never, args as never)
      if (error) expect(error.code).toBe('42501')
      else expect(data).toBe(false)
    })
  }
  it('auth_role_in_org() as anon: NULL (or refused)', async () => {
    const { data, error } = await anon().rpc('auth_role_in_org' as never, { p_org_id: org.orgId } as never)
    if (error) expect(error.code).toBe('42501')
    else expect(data).toBeNull()
  })
})

describe('0070 M6: an email-less or unconfirmed identity matches no resident row', () => {
  it('a JWT with no email claim, and a property_residents row with an empty email, match nothing', async () => {
    const user = await mintUser(org, 'resident')
    const { data: prop } = await adminDb().from('hoa_properties').insert({ org_id: org.orgId, address: '1 Blank Way' }).select('id').single()
    const { data: unit } = await adminDb()
      .from('units')
      .insert({ organization_id: org.orgId, association_id: org.associationId, address_line1: '1 Blank Way', legacy_hoa_property_id: prop!.id })
      .select('id')
      .single()
    const { error } = await adminDb()
      .from('property_residents')
      .insert({ organization_id: org.orgId, property_id: prop!.id, full_name: 'Blank', email: '', role: 'owner' })
    if (error) throw new Error(`seed property_residents: ${error.code}`)

    const claims = { sub: user.id, role: 'authenticated' } // note: no email claim
    const props = psqlAsJwt<{ ids: string[] }>(claims, 'select public.auth_resident_property_ids() as ids')
    expect(props[0]?.ids).toEqual([])
    const units = psqlAsJwt<{ ids: string[] }>(claims, 'select public.auth_resident_unit_ids() as ids')
    expect(units[0]?.ids).not.toContain(unit!.id)

    // And an empty-string email claim is the same as none.
    const blank = psqlAsJwt<{ ids: string[] }>({ ...claims, email: '' }, 'select public.auth_resident_property_ids() as ids')
    expect(blank[0]?.ids).toEqual([])
  })

  it('a null uid (no sub) matches nothing, even for a row whose owner_user_id is NULL', async () => {
    const { data: prop } = await adminDb().from('hoa_properties').insert({ org_id: org.orgId, address: '2 Null Way' }).select('id').single()
    const { data: unit } = await adminDb()
      .from('units')
      .insert({ organization_id: org.orgId, association_id: org.associationId, address_line1: '2 Null Way', legacy_hoa_property_id: prop!.id })
      .select('id')
      .single()
    await adminDb().from('ownerships').insert({ organization_id: org.orgId, unit_id: unit!.id, owner_name: 'No account', valid_from: '2024-01-01' })
    const rows = psqlAsJwt<{ ids: string[] }>({ role: 'authenticated' }, 'select public.auth_resident_unit_ids() as ids')
    expect(rows[0]?.ids).toEqual([])
    const orgs = psqlAsJwt<{ ids: string[] }>({ role: 'authenticated' }, 'select public.auth_org_ids() as ids')
    expect(orgs[0]?.ids).toEqual([])
  })
})

describe('0070 L1: catalog', () => {
  it('every SECURITY DEFINER function in public pins search_path', () => {
    const offenders = psqlRows<{ proname: string }>(
      `select p.proname
         from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and p.prosecdef
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')
          and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
        order by 1`,
    )
    expect(offenders.map((o) => o.proname), 'definer functions without a pinned search_path').toEqual([])
  })

  it('auth_org_ids reads public.org_members with a pinned path and drops suspended orgs', () => {
    const [fn] = psqlRows<{ src: string; cfg: string[] }>(
      `select pg_get_functiondef(p.oid) as src, p.proconfig as cfg from pg_proc p where p.proname = 'auth_org_ids' and p.pronamespace = 'public'::regnamespace`,
    )
    expect(fn?.cfg).toContain('search_path=public, pg_temp')
    expect(fn?.src).toContain('public.org_members')
    expect(fn?.src).toContain('suspended_at IS NULL')
    expect(fn?.src).toContain('archived_at IS NULL')
  })
})
