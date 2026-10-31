import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * BL-175b H5: law updates are one platform-wide feed. Board/admin of an org
 * get a plain refusal (no database call, no RLS error text); a platform admin
 * writes through the service role.
 */
const h = vi.hoisted(() => ({
  platformAdmin: false,
  adminCalls: [] as Array<{ table: string; op: string; payload?: unknown }>,
  userDbCalls: 0,
}))

vi.mock('@/lib/platform-admin', () => ({ isPlatformAdmin: vi.fn(async () => h.platformAdmin) }))

vi.mock('@homeowner-portal/db', () => {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {}
    const rec = (op: string) => (payload?: unknown) => {
      h.adminCalls.push({ table, op, payload })
      return chain
    }
    chain.insert = rec('insert')
    chain.update = rec('update')
    chain.select = () => chain
    chain.eq = () => chain
    chain.is = () => chain
    chain.single = async () => ({ data: { id: 'upd-1' }, error: null })
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null })
    return chain
  }
  return { createAdminClient: () => ({ from: builder }) }
})

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    h.userDbCalls += 1
    return {
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
      from: () => {
        throw new Error('law-update writes must not use the user client (RLS error would leak)')
      },
    }
  }),
}))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: vi.fn(async () => ({ id: 'a', name: 'A', state: 'GA' })) }))
vi.mock('@/lib/api/ai-action-quota', () => ({ chargeAiActionQuota: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({ BOARD_ONLY_DENIED: 'no', requireBoardOrAdminForAction: vi.fn() }))
vi.mock('@homeowner-portal/workflows', () => ({ askStateLaw: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { archiveLawUpdate, createLawUpdate, deleteLawUpdate, unarchiveLawUpdate, updateLawUpdate } from './state-law'

const REFUSAL = { ok: false, error: 'Only the platform team can edit law updates.' }
const ID = '11111111-1111-4111-8111-111111111111'
const input = {
  headline: 'New fine cap in effect',
  summary: 'A summary that is comfortably longer than twenty characters.',
  actionItems: [],
  state: 'GA' as const,
}

beforeEach(() => {
  h.platformAdmin = false
  h.adminCalls = []
  h.userDbCalls = 0
})

describe('law updates are platform-admin only', () => {
  it('a board member or admin is refused every write, with no database call at all', async () => {
    const results = [
      await createLawUpdate(input),
      await archiveLawUpdate(ID),
      await unarchiveLawUpdate(ID),
      await deleteLawUpdate(ID),
      await updateLawUpdate(ID, { headline: 'Edited headline' }),
    ]
    for (const r of results) expect(r).toEqual(REFUSAL)
    expect(h.adminCalls).toEqual([])
    expect(h.userDbCalls).toBe(0)
  })

  it('a platform admin posts through the service role as themselves', async () => {
    h.platformAdmin = true
    const r = await createLawUpdate(input)
    expect(r).toEqual({ ok: true, data: { updateId: 'upd-1' } })
    expect(h.adminCalls).toHaveLength(1)
    expect(h.adminCalls[0]).toMatchObject({ table: 'state_law_updates', op: 'insert', payload: { state: 'GA', posted_by: 'user-1' } })
  })

  it('editing applies the same validation as posting, with no write on failure', async () => {
    h.platformAdmin = true
    const short = await updateLawUpdate(ID, { headline: 'abc', summary: 'too short', sourceUrl: 'not a url' })
    expect(short.ok).toBe(false)
    expect(short).toMatchObject({ fieldErrors: { headline: 'Headline is too short.', summary: 'Summary should be at least 20 chars.' } })
    expect(h.adminCalls).toEqual([])
  })

  it('editing saves every changed field, including the related statute', async () => {
    h.platformAdmin = true
    const STATUTE = '22222222-2222-4222-8222-222222222222'
    const r = await updateLawUpdate(ID, { ...input, category: 'fines', effectiveDate: '2027-01-01', relatedStatuteId: STATUTE })
    expect(r).toEqual({ ok: true })
    expect(h.adminCalls[0]).toMatchObject({
      table: 'state_law_updates',
      op: 'update',
      payload: { headline: input.headline, category: 'fines', effective_date: '2027-01-01', related_statute_id: STATUTE },
    })
  })

  it('a platform admin archives, restores, soft-deletes and edits through the service role', async () => {
    h.platformAdmin = true
    expect(await archiveLawUpdate(ID)).toEqual({ ok: true })
    expect(await unarchiveLawUpdate(ID)).toEqual({ ok: true })
    expect(await deleteLawUpdate(ID)).toEqual({ ok: true })
    expect(await updateLawUpdate(ID, { headline: 'Edited headline' })).toEqual({ ok: true })
    expect(h.adminCalls.map((c) => c.op)).toEqual(['update', 'update', 'update', 'update'])
    expect(h.userDbCalls).toBe(0)
  })
})
