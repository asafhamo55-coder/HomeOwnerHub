import { afterEach, describe, expect, it, vi } from 'vitest'
import { queuedSupabase, type QueuedCall } from '@/lib/test-utils/fake-supabase-queue'
import {
  BROADCAST_DRAFT_LABEL,
  REPLY_DRAFTS_LIMIT,
  combinedDraftCount,
  listWaitingReplyDrafts,
  pickWaitingReplyDrafts,
  replyDraftHref,
  replyDraftTitle,
  type DraftRowLite,
  type ThreadLite,
} from './drafts'
import { draftHref } from '@/lib/communications/drafts'

const ORG = 'org-1'
const T1 = '11111111-0000-4000-8000-000000000001'
const T2 = '11111111-0000-4000-8000-000000000002'
const T3 = '11111111-0000-4000-8000-000000000003'

const draft = (over: Partial<DraftRowLite>): DraftRowLite => ({
  id: 'd',
  thread_id: T1,
  kind: 'reply',
  status: 'draft',
  created_at: '2026-10-20T10:00:00Z',
  ...over,
})

const threadMap = (rows: ThreadLite[]) => new Map(rows.map((t) => [t.id, t]))

afterEach(() => vi.restoreAllMocks())

describe('labels and links', () => {
  it('labels a reply by home, then subject, then a neutral fallback', () => {
    expect(replyDraftTitle({ address: '12 Elm St', subject: 'Pool hours' })).toBe('Reply to 12 Elm St')
    expect(replyDraftTitle({ address: null, subject: 'Pool hours' })).toBe('Reply to “Pool hours”')
    expect(replyDraftTitle({ address: '  ', subject: '  ' })).toBe('Reply to a resident')
  })

  it('a broadcast draft is labelled as a message to many homes', () => {
    expect(BROADCAST_DRAFT_LABEL).toBe('Message to many homes')
  })

  it('a reply opens its conversation; a broadcast opens the composer with ?draft=', () => {
    expect(replyDraftHref(T1)).toBe(`/inbox/${T1}`)
    expect(draftHref('c1')).toBe('/communications/new?draft=c1')
  })
})

describe('combinedDraftCount', () => {
  it('adds both kinds', () => expect(combinedDraftCount(2, 3)).toBe(5))
  it('an unreadable count adds nothing', () => {
    expect(combinedDraftCount(null, 3)).toBe(3)
    expect(combinedDraftCount(2, null)).toBe(2)
  })
  it('shows no number when neither could be read', () => expect(combinedDraftCount(null, null)).toBeNull())
})

describe('pickWaitingReplyDrafts', () => {
  const threads = threadMap([
    { id: T1, subject: 'Pool hours', unit_id: 'u1' },
    { id: T2, subject: 'Gate code', unit_id: null },
  ])
  const addresses = new Map([['u1', '12 Elm St']])

  it('lists one waiting draft per open thread, newest first, labelled and linked', () => {
    const rows = pickWaitingReplyDrafts(
      [
        draft({ id: 'a', thread_id: T1, created_at: '2026-10-19T10:00:00Z' }),
        draft({ id: 'b', thread_id: T2, created_at: '2026-10-20T10:00:00Z' }),
      ],
      threads,
      addresses,
    )
    expect(rows).toEqual([
      {
        draftId: 'b',
        threadId: T2,
        title: 'Reply to “Gate code”',
        subject: null,
        createdAt: '2026-10-20T10:00:00Z',
        href: `/inbox/${T2}`,
      },
      {
        draftId: 'a',
        threadId: T1,
        title: 'Reply to 12 Elm St',
        subject: 'Pool hours',
        createdAt: '2026-10-19T10:00:00Z',
        href: `/inbox/${T1}`,
      },
    ])
  })

  it('drops a stale draft behind a newer queued, sent or cancelled one', () => {
    for (const status of ['queued', 'sending', 'sent', 'cancelled', 'failed']) {
      const rows = pickWaitingReplyDrafts(
        [
          draft({ id: 'old', created_at: '2026-10-19T10:00:00Z' }),
          draft({ id: 'new', status, created_at: '2026-10-20T10:00:00Z' }),
        ],
        threads,
        addresses,
      )
      expect(rows).toEqual([])
    }
  })

  it('keeps only the newest of several waiting drafts on a thread', () => {
    const rows = pickWaitingReplyDrafts(
      [draft({ id: 'old', created_at: '2026-10-19T10:00:00Z' }), draft({ id: 'new', created_at: '2026-10-20T10:00:00Z' })],
      threads,
      addresses,
    )
    expect(rows.map((r) => r.draftId)).toEqual(['new'])
  })

  it('ignores forwards, threadless drafts and threads that are closed or filed (absent from the map)', () => {
    const rows = pickWaitingReplyDrafts(
      [
        draft({ id: 'fwd', kind: 'forward' }),
        draft({ id: 'new-email', kind: 'new', thread_id: null }),
        draft({ id: 'closed', thread_id: T3 }),
      ],
      threads,
      addresses,
    )
    expect(rows).toEqual([])
  })
})

const ops = (calls: QueuedCall[], table: string, i = 0) => calls.filter((c) => c.table === table)[i]?.ops ?? []

describe('listWaitingReplyDrafts', () => {
  it('scopes every read to the org and reads only open, visible threads', async () => {
    const { db, calls } = queuedSupabase({
      inbox_drafts: [
        { data: [{ thread_id: T1 }, { thread_id: T1 }, { thread_id: T3 }], error: null },
        {
          data: [
            draft({ id: 'a', thread_id: T1 }),
            draft({ id: 'c', thread_id: T3 }),
          ],
          error: null,
        },
      ],
      inbox_threads: [{ data: [{ id: T1, subject: 'Pool hours', unit_id: 'u1' }], error: null }],
      units: [{ data: [{ id: 'u1', address_line1: '12 Elm St' }], error: null }],
    })
    const res = await listWaitingReplyDrafts(db as never, ORG)
    expect(res).toEqual({
      ok: true,
      rows: [expect.objectContaining({ draftId: 'a', title: 'Reply to 12 Elm St', href: `/inbox/${T1}` })],
    })

    for (const c of calls) expect(c.ops).toContainEqual(['eq', ['organization_id', ORG]])
    const candidates = ops(calls, 'inbox_drafts', 0)
    expect(candidates).toContainEqual(['eq', ['status', 'draft']])
    expect(candidates).toContainEqual(['eq', ['kind', 'reply']])
    expect(candidates).toContainEqual(['limit', [REPLY_DRAFTS_LIMIT * 2]])
    const threads = ops(calls, 'inbox_threads')
    expect(threads).toContainEqual(['in', ['id', [T1, T3]]])
    expect(threads).toContainEqual(['neq', ['status', 'closed']])
    expect(threads).toContainEqual(['not', ['gmail_state', 'in', '("archived","trashed")']])
    // No resident contact details or draft bodies are read.
    for (const c of calls) {
      const select = c.ops.find(([op]) => op === 'select')?.[1][0] as string
      expect(select).not.toMatch(/email|body|participants|resident/)
    }
  })

  it('returns no rows without further reads when nothing is waiting', async () => {
    const { db, calls } = queuedSupabase({ inbox_drafts: [{ data: [], error: null }] })
    expect(await listWaitingReplyDrafts(db as never, ORG)).toEqual({ ok: true, rows: [] })
    expect(calls).toHaveLength(1)
  })

  it('reports a failed read as a failure, not as none, and logs ids only', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = queuedSupabase({
      inbox_drafts: [{ data: null, error: { code: '42501', message: 'denied for 12 Elm St' } }],
    })
    expect(await listWaitingReplyDrafts(db as never, ORG)).toEqual({ ok: false })
    expect(JSON.stringify(err.mock.calls)).not.toContain('Elm')
    expect(JSON.stringify(err.mock.calls)).toContain(ORG)
  })

  it('a failed thread read is a failure too', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = queuedSupabase({
      inbox_drafts: [
        { data: [{ thread_id: T1 }], error: null },
        { data: [], error: null },
      ],
      inbox_threads: [{ data: null, error: { code: 'XX', message: 'boom' } }],
    })
    expect(await listWaitingReplyDrafts(db as never, ORG)).toEqual({ ok: false })
  })

  it('a failed address lookup falls back to the subject', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = queuedSupabase({
      inbox_drafts: [
        { data: [{ thread_id: T1 }], error: null },
        { data: [draft({ id: 'a', thread_id: T1 })], error: null },
      ],
      inbox_threads: [{ data: [{ id: T1, subject: 'Pool hours', unit_id: 'u1' }], error: null }],
      units: [{ data: null, error: { code: 'XX', message: 'boom' } }],
    })
    const res = await listWaitingReplyDrafts(db as never, ORG)
    expect(res.ok && res.rows.map((r) => r.title)).toEqual(['Reply to “Pool hours”'])
  })
})
