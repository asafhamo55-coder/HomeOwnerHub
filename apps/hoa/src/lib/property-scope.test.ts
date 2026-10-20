import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadPropertyScope, parsePropertyParam, withPropertyParam } from './property-scope'

const ID = '3f1c2b9a-1d2e-4f50-8a6b-0c1d2e3f4a5b'

describe('parsePropertyParam', () => {
  it('accepts a uuid, case-insensitively, trimmed', () => {
    expect(parsePropertyParam(ID)).toBe(ID)
    expect(parsePropertyParam(` ${ID.toUpperCase()} `)).toBe(ID)
  })
  it('ignores anything else, so a junk param never reaches a query', () => {
    for (const raw of [undefined, '', 'all', '1', `${ID},x`, "x' or 1=1"]) expect(parsePropertyParam(raw)).toBeNull()
  })
  it('takes the first of repeated params', () => {
    expect(parsePropertyParam([ID, 'x'])).toBe(ID)
  })
})

describe('withPropertyParam', () => {
  it('adds or keeps the scope on a list link', () => {
    expect(withPropertyParam('/violations?status=action', ID)).toBe(`/violations?status=action&property=${ID}`)
    expect(withPropertyParam('/violations', null)).toBe('/violations')
  })
})

describe('loadPropertyScope', () => {
  it('reads the hoa_properties org column (org_id) and returns it as orgId', async () => {
    let selected = ''
    const row = { address: '1 Main St', unit_number: null, org_id: 'org-1' }
    const chain: Record<string, unknown> = {}
    chain.select = (cols: string) => { selected = cols; return chain }
    chain.eq = () => chain
    chain.is = () => chain
    chain.maybeSingle = async () => ({ data: row, error: null })
    const supabase = { from: () => chain } as unknown as SupabaseClient
    const scope = await loadPropertyScope(supabase, ID)
    expect(selected.split(',').map((c) => c.trim())).toContain('org_id')
    expect(selected).not.toContain('organization_id')
    expect(scope).toEqual({ id: ID, address: '1 Main St', unitNumber: null, orgId: 'org-1' })
  })
})
