import { describe, expect, it } from 'vitest'
import { PAST_LIMIT, RESIDENT_MEETINGS_FUNCTION, ResidentMeetingsLoadError, fetchResidentMeetings } from './query'
import { RESIDENT_MEETING_COLUMNS } from './select'

const ORG = 'org-1'
const opts = { orgId: ORG, today: '2026-10-19', timeZone: 'America/New_York' }

type Resp = { data: unknown; error: { code?: string } | null }

/** A chainable rpc stand-in. Each rpc() call is one query; records its filters. */
function fakeClient(responses: (filters: [string, unknown[]][]) => Resp) {
  const queries: { fn: string; filters: [string, unknown[]][] }[] = []
  const client = {
    rpc(fn: string) {
      const q = { fn, filters: [] as [string, unknown[]][] }
      queries.push(q)
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'gte', 'lt', 'order', 'limit']) {
        b[op] = (...args: unknown[]) => {
          q.filters.push([op, args])
          return b
        }
      }
      b.then = (ok: (r: Resp) => unknown, bad?: (e: unknown) => unknown) =>
        Promise.resolve(responses(q.filters)).then(ok, bad)
      return b
    },
  }
  return { client, queries }
}

const isUpcomingQuery = (f: [string, unknown[]][]) => f.some(([op, a]) => op === 'eq' && a[0] === 'status' && a[1] === 'draft')

describe('fetchResidentMeetings', () => {
  it('filters each query by org, status and date, and names only the allowlisted columns', async () => {
    const { client, queries } = fakeClient(() => ({ data: [], error: null }))
    await fetchResidentMeetings(client, opts)
    expect(queries.map((q) => q.fn)).toEqual([RESIDENT_MEETINGS_FUNCTION, RESIDENT_MEETINGS_FUNCTION])
    const [up, past] = queries
    expect(up!.filters).toEqual(
      expect.arrayContaining([
        ['select', [RESIDENT_MEETING_COLUMNS]],
        ['eq', ['org_id', ORG]],
        ['eq', ['status', 'draft']],
        ['gte', ['meeting_date', '2026-10-19']],
      ]),
    )
    expect(past!.filters).toEqual(
      expect.arrayContaining([
        ['select', [RESIDENT_MEETING_COLUMNS]],
        ['eq', ['org_id', ORG]],
        ['eq', ['status', 'approved']],
        ['lt', ['meeting_date', '2026-10-19']],
      ]),
    )
    // The past query never asks for drafts, the upcoming one never for approved.
    expect(past!.filters).not.toContainEqual(['eq', ['status', 'draft']])
    expect(up!.filters).not.toContainEqual(['eq', ['status', 'approved']])
  })

  it('re-filters the rows: a draft returned by a too-loose function never reaches the past list', async () => {
    const { client } = fakeClient((f) =>
      isUpcomingQuery(f)
        ? { data: [], error: null }
        : {
            data: [
              { id: 'leak', org_id: ORG, meeting_date: '2026-09-01', meeting_type: 'regular', status: 'draft', body: 'DRAFT', updated_at: null },
              { id: 'other', org_id: 'org-2', meeting_date: '2026-09-01', meeting_type: 'regular', status: 'approved', body: 'theirs', updated_at: null },
              { id: 'ok', org_id: ORG, meeting_date: '2026-09-02', meeting_type: 'annual', status: 'approved', body: 'Minutes', updated_at: null },
            ],
            error: null,
          },
    )
    const r = await fetchResidentMeetings(client, opts)
    expect(r.available).toBe(true)
    if (!r.available) return
    expect(r.past.map((m) => m.id)).toEqual(['ok'])
    expect(r.upcoming).toEqual([])
    expect(JSON.stringify(r)).not.toMatch(/DRAFT|theirs/)
  })

  it('reports "not available" when the function is not applied, rather than an empty list', async () => {
    const { client } = fakeClient(() => ({ data: null, error: { code: 'PGRST202' } }))
    expect(await fetchResidentMeetings(client, opts)).toEqual({ available: false })
  })

  it('throws on any other error, with the code only', async () => {
    const { client } = fakeClient(() => ({ data: null, error: { code: '42501' } }))
    await expect(fetchResidentMeetings(client, opts)).rejects.toBeInstanceOf(ResidentMeetingsLoadError)
    await expect(fetchResidentMeetings(client, opts)).rejects.toThrow('(42501)')
  })

  it('says when the past list was capped', async () => {
    const many = Array.from({ length: PAST_LIMIT }, (_, i) => ({
      id: `p${i}`,
      org_id: ORG,
      meeting_date: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`,
      meeting_type: 'regular',
      status: 'approved',
      body: 'm',
      updated_at: null,
    }))
    const { client } = fakeClient((f) => (isUpcomingQuery(f) ? { data: [], error: null } : { data: many, error: null }))
    const r = await fetchResidentMeetings(client, opts)
    expect(r.available && r.pastCapped).toBe(true)
  })
})
