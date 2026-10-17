import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { payloadOf, queuedSupabase } from '@/lib/test-utils/fake-supabase-queue'
import {
  DEFAULT_CHART_OF_ACCOUNTS,
  associationSlug,
  parseNewAssociation,
  readPrimaryAssociation,
  safeSetupReturnTo,
  setUpAssociationCore,
} from './association-setup'

const ok = (data: unknown) => ({ data, error: null })
const fail = (code: string) => ({ data: null, error: { code, message: 'boom' } })

describe('associationSlug', () => {
  it('upper-cases and keeps only letters and digits (the 0006 backfill rule)', () => {
    expect(associationSlug('Willow Creek HOA')).toBe('WILLOWCREEKHOA')
    expect(associationSlug('Lot #12 — Phase 2')).toBe('LOT12PHASE2')
  })

  it('never returns an empty slug (the column is NOT NULL)', () => {
    expect(associationSlug('—!!')).toBe('HOA')
  })
})

describe('parseNewAssociation', () => {
  it('accepts a name, a US state and a type', () => {
    expect(parseNewAssociation({ name: '  Willow Creek  ', state: 'FL', type: 'condo' })).toEqual({
      ok: true,
      data: { name: 'Willow Creek', state: 'FL', type: 'condo' },
    })
  })

  it('defaults the type to hoa', () => {
    const r = parseNewAssociation({ name: 'Willow Creek', state: 'GA', type: null })
    expect(r.ok && r.data.type).toBe('hoa')
  })

  it('reports each bad field', () => {
    const r = parseNewAssociation({ name: 'W', state: 'ZZ', type: 'castle' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(['name', 'state', 'type'])
  })
})

describe('safeSetupReturnTo', () => {
  it('keeps an in-app path', () => {
    expect(safeSetupReturnTo('/accounting/coa')).toBe('/accounting/coa')
  })
  it('falls back to /dues for anything else', () => {
    for (const bad of [null, '', 'https://evil.example', '//evil.example', '/\\evil', 'dues']) {
      expect(safeSetupReturnTo(bad)).toBe('/dues')
    }
  })
})

describe('readPrimaryAssociation', () => {
  it('returns the first association by name', async () => {
    const { db, calls } = queuedSupabase({ associations: [ok({ id: 'a1', name: 'Willow Creek' })] })
    const res = await readPrimaryAssociation(db as never, 'o1')
    expect(res).toEqual({ ok: true, data: { id: 'a1', name: 'Willow Creek' }, count: null })
    expect(calls[0]!.ops.map(([op]) => op)).toEqual(['select', 'eq', 'order', 'limit', 'maybeSingle'])
  })

  it('tells "none yet" apart from "could not read"', async () => {
    const none = queuedSupabase({ associations: [ok(null)] })
    expect(await readPrimaryAssociation(none.db as never, 'o1')).toEqual({ ok: true, data: null, count: null })
    const broken = queuedSupabase({ associations: [fail('500')] })
    expect(await readPrimaryAssociation(broken.db as never, 'o1')).toEqual({ ok: false })
  })
})

describe('DEFAULT_CHART_OF_ACCOUNTS', () => {
  it('matches the chart scripts/seed-accounting.ts writes', () => {
    const script = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../scripts/seed-accounting.ts'), 'utf8')
    const scriptNumbers = [...script.matchAll(/\{ number: '(\d{4})'/g)].map((m) => m[1])
    expect(DEFAULT_CHART_OF_ACCOUNTS.map((a) => a.number)).toEqual(scriptNumbers)
  })
})

describe('setUpAssociationCore', () => {
  const input = { name: 'Willow Creek', state: 'FL', type: 'hoa' as const }
  const year = 2026

  it('creates the association, both funds, the chart of accounts and an open fiscal year', async () => {
    const { db, calls } = queuedSupabase({
      associations: [ok(null), ok({ id: 'a1' })],
      funds: [
        ok([]),
        ok([
          { id: 'f-op', code: 'OPERATING' },
          { id: 'f-res', code: 'RESERVE' },
        ]),
      ],
      chart_of_accounts: [ok([]), ok(null)],
      fiscal_periods: [ok(null), ok(null)],
    })
    const res = await setUpAssociationCore(db as never, { orgId: 'o1', input, year })
    expect(res).toEqual({ ok: true, associationId: 'a1', created: true })

    expect(payloadOf(calls, 'associations', 'insert')).toEqual({
      organization_id: 'o1',
      name: 'Willow Creek',
      state: 'FL',
      governing_law_state: 'FL',
      type: 'hoa',
      slug: 'WILLOWCREEK',
    })
    const funds = payloadOf(calls, 'funds', 'insert') as unknown as Record<string, unknown>[]
    expect(funds.map((f) => f.code)).toEqual(['OPERATING', 'RESERVE'])
    expect(funds.every((f) => f.association_id === 'a1' && f.organization_id === 'o1')).toBe(true)

    const coa = payloadOf(calls, 'chart_of_accounts', 'insert') as unknown as Record<string, unknown>[]
    expect(coa).toHaveLength(DEFAULT_CHART_OF_ACCOUNTS.length)
    expect(coa.find((a) => a.account_number === '1010')?.fund_id).toBe('f-op')
    expect(coa.find((a) => a.account_number === '1020')?.fund_id).toBe('f-res')
    expect(coa.find((a) => a.account_number === '1100')?.fund_id).toBeNull()

    expect(payloadOf(calls, 'fiscal_periods', 'insert')).toEqual({
      organization_id: 'o1',
      association_id: 'a1',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      status: 'open',
    })
  })

  it('reuses an existing association and only fills in what is missing', async () => {
    const { db, calls } = queuedSupabase({
      associations: [ok({ id: 'a1' })],
      funds: [
        ok([{ id: 'f-op', code: 'OPERATING' }]),
        ok([{ id: 'f-res', code: 'RESERVE' }]),
      ],
      chart_of_accounts: [ok(DEFAULT_CHART_OF_ACCOUNTS.map((a) => ({ account_number: a.number })))],
      fiscal_periods: [ok({ id: 'p1' })],
    })
    const res = await setUpAssociationCore(db as never, { orgId: 'o1', input, year })
    expect(res).toEqual({ ok: true, associationId: 'a1', created: false })
    expect(payloadOf(calls, 'associations', 'insert')).toBeUndefined()
    expect((payloadOf(calls, 'funds', 'insert') as unknown as { code: string }[]).map((f) => f.code)).toEqual(['RESERVE'])
    expect(payloadOf(calls, 'chart_of_accounts', 'insert')).toBeUndefined()
    expect(payloadOf(calls, 'fiscal_periods', 'insert')).toBeUndefined()
  })

  it('says only an admin can create it when RLS refuses the insert', async () => {
    const { db } = queuedSupabase({ associations: [ok(null), fail('42501')] })
    const res = await setUpAssociationCore(db as never, { orgId: 'o1', input, year })
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/admin/i) })
  })

  it('fails rather than reporting success when the existence check fails', async () => {
    const { db, calls } = queuedSupabase({ associations: [fail('500')] })
    const res = await setUpAssociationCore(db as never, { orgId: 'o1', input, year })
    expect(res.ok).toBe(false)
    expect(payloadOf(calls, 'associations', 'insert')).toBeUndefined()
  })

  it('reports a failed accounting step, keeping the association it made', async () => {
    const { db } = queuedSupabase({
      associations: [ok(null), ok({ id: 'a1' })],
      funds: [ok([]), fail('500')],
    })
    const res = await setUpAssociationCore(db as never, { orgId: 'o1', input, year })
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/books/i), associationId: 'a1' })
  })
})
