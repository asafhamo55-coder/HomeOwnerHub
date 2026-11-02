import { beforeEach, describe, expect, it, vi } from 'vitest'

const inserted: { ballots: Record<string, unknown>[] } = { ballots: [] }
let assocRow: { id: string; state: string | null } | null = { id: '11111111-1111-4111-8111-111111111111', state: 'CA' }

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => ({}) }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'no',
  requireBoardOrAdminForAction: async () => ({ ok: true, orgId: '22222222-2222-4222-8222-222222222222' }),
}))
vi.mock('@homeowner-portal/db', () => ({
  M10_APPLIED: true,
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: assocRow, error: null }) }) }),
      }),
      insert: (row: Record<string, unknown> | Record<string, unknown>[]) => {
        if (table === 'ballots') inserted.ballots.push(row as Record<string, unknown>)
        return { select: () => ({ single: async () => ({ data: { id: '33333333-3333-4333-8333-333333333333' }, error: null }) }), then: undefined }
      },
    }),
  }),
}))

import { createBallotDraft } from './actions'

const A = '11111111-1111-4111-8111-111111111111'
const base = { kind: 'question' as const, title: 'Pool hours', maxSelections: 1, options: ['Yes', 'No'] }

beforeEach(() => {
  inserted.ballots = []
  assocRow = { id: A, state: 'GA' }
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-01T12:00:00Z'))
})

describe('createBallotDraft reads deadlines on the association clock', () => {
  it('a Georgia association: 6 PM on Nov 5 is EST', async () => {
    const r = await createBallotDraft(A, null, { ...base, opensLocal: '2026-11-03T09:00', closesLocal: '2026-11-05T18:00' })
    expect(r.ok).toBe(true)
    expect(inserted.ballots[0]).toMatchObject({ opens_at: '2026-11-03T14:00:00.000Z', closes_at: '2026-11-05T23:00:00.000Z' })
  })

  it('a Georgia association in summer is EDT', async () => {
    await createBallotDraft(A, null, { ...base, opensLocal: '2026-10-20T09:00', closesLocal: '2026-10-21T18:00' })
    expect(inserted.ballots[0]).toMatchObject({ opens_at: '2026-10-20T13:00:00.000Z', closes_at: '2026-10-21T22:00:00.000Z' })
  })

  it('the state comes from the association row, not from the caller', async () => {
    assocRow = { id: A, state: 'TX' }
    const r = await createBallotDraft(A, null, { ...base, opensLocal: '2026-11-03T09:00', closesLocal: '2026-11-05T18:00' })
    expect(r.ok).toBe(false)
    expect(inserted.ballots).toHaveLength(0)
  })

  it('a window across the fall-back night keeps each end on its own offset', async () => {
    assocRow = { id: A, state: 'GA' }
    await createBallotDraft(A, null, { ...base, opensLocal: '2026-11-01T00:30', closesLocal: '2026-11-02T02:30' })
    // Fall back night: 12:30 AM is still EDT, 2:30 AM the next day is EST.
    expect(inserted.ballots[0]).toMatchObject({ opens_at: '2026-11-01T04:30:00.000Z', closes_at: '2026-11-02T07:30:00.000Z' })
  })

  it('refuses text that is not a date and time', async () => {
    const r = await createBallotDraft(A, null, { ...base, opensLocal: 'soon', closesLocal: '2026-11-05T18:00' })
    expect(r.ok).toBe(false)
  })
})
