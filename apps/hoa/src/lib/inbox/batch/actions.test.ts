import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// BL-101 A9 — batch reply. approveDraft is mocked: this proves every
// thread is routed THROUGH it (and so through the send job's outbound
// guard), one recipient per draft, and that nothing is queued without the
// confirmed count. No email is sent. Synthetic ids and addresses only.

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const T1 = id(1)
const T2 = id(2)
const T3 = id(3)

type R = { data: unknown; error: unknown }
let reads: Record<string, R>
let inserts: Array<Record<string, unknown>>

function fakeDb() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from(table: string) {
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'order']) chain[m] = () => chain
      chain.then = (resolve: (r: R) => unknown) => resolve(reads[table] ?? { data: [], error: null })
      chain.insert = (row: Record<string, unknown>) => {
        inserts.push(row)
        return { select: () => ({ single: async () => ({ data: { id: `draft-${inserts.length}` }, error: null }) }) }
      }
      return chain
    },
  }
}

vi.mock('@/lib/auth', () => ({ requireBoardOrAdmin: vi.fn(async () => ({ role: 'board', org: { id: 'org-1' } })) }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => fakeDb()) }))
vi.mock('@/lib/app-origin', () => ({ appUrl: (p: string) => `https://app.example.test${p}` }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const approveDraft = vi.fn()
const cancelDraft = vi.fn()
vi.mock('@/lib/inbox/draft/actions', () => ({
  approveDraft: (...a: unknown[]) => approveDraft(...a),
  cancelDraft: (...a: unknown[]) => cancelDraft(...a),
}))

import { sendBatchReply, undoBatchReply } from './actions'

const BODY = 'Hi {{first_name}}, the pool reopens after resurfacing. Details: {{portal_link}}'

let logSpies: Array<ReturnType<typeof vi.spyOn>>
beforeEach(() => {
  inserts = []
  reads = {
    inbox_threads: {
      data: [
        { id: T1, subject: 'Pool reopening?', status: 'needs_review' },
        { id: T2, subject: 'Re: pool date', status: 'open' },
        { id: T3, subject: 'Pool', status: 'closed' },
      ],
      error: null,
    },
    inbox_messages: {
      data: [
        { thread_id: T1, from_email: 'pat@example.test', from_name: 'Pat Example', sent_at: '2026-10-20' },
        { thread_id: T1, from_email: 'older@example.test', from_name: 'Old', sent_at: '2026-10-01' },
        { thread_id: T2, from_email: 'sam@example.test', from_name: null, sent_at: '2026-10-19' },
        { thread_id: T3, from_email: 'lee@example.test', from_name: 'Lee', sent_at: '2026-10-18' },
      ],
      error: null,
    },
    inbox_drafts: { data: [], error: null },
  }
  approveDraft.mockReset().mockResolvedValue({ ok: true, sendAfter: '2026-10-20T12:00:30Z', threadClosed: true })
  cancelDraft.mockReset().mockResolvedValue({ ok: true })
  logSpies = [vi.spyOn(console, 'error').mockImplementation(() => {}), vi.spyOn(console, 'info').mockImplementation(() => {})]
})
afterEach(() => logSpies.forEach((s) => s.mockRestore()))

describe('sendBatchReply', () => {
  it('queues one draft per thread, each to that thread’s newest sender only, via approveDraft', async () => {
    const r = await sendBatchReply({ threadIds: [T1, T2], body: BODY, confirmCount: 2, closeThreads: true })
    expect(r).toMatchObject({ ok: true, queued: ['draft-1', 'draft-2'], skipped: [] })
    expect(inserts.map((i) => i.to_emails)).toEqual([['pat@example.test'], ['sam@example.test']])
    expect(inserts.every((i) => i.status === 'draft' && (i.cc_emails as string[]).length === 0)).toBe(true)
    expect(inserts[0]).toMatchObject({ subject: 'Re: Pool reopening?', thread_id: T1, kind: 'reply' })
    expect(inserts[1]).toMatchObject({ subject: 'Re: pool date' })
    expect(inserts[0]!.body_text).toBe('Hi Pat, the pool reopens after resurfacing. Details: https://app.example.test/resident')
    expect(inserts[1]!.body_text).toMatch(/^Hi there,/)
    expect(approveDraft).toHaveBeenCalledTimes(2)
    expect(approveDraft).toHaveBeenNthCalledWith(
      1,
      'draft-1',
      { subject: 'Re: Pool reopening?', body: inserts[0]!.body_text, to: ['pat@example.test'], cc: [] },
      { closeThread: true },
    )
  })

  it('sends nothing unless the confirmed count matches', async () => {
    const r = await sendBatchReply({ threadIds: [T1, T2], body: BODY, confirmCount: 3, closeThreads: false })
    expect(r).toMatchObject({ ok: false })
    expect(inserts).toEqual([])
    expect(approveDraft).not.toHaveBeenCalled()
  })

  it('refuses a body with a balance or a blank before touching anything', async () => {
    for (const body of ['Your balance is {{balance}}', 'Hours: [[BLANK: community_fact]]']) {
      const r = await sendBatchReply({ threadIds: [T1, T2], body, confirmCount: 2, closeThreads: false })
      expect(r.ok).toBe(false)
    }
    expect(inserts).toEqual([])
  })

  it('caps the batch and refuses duplicates', async () => {
    const many = Array.from({ length: 26 }, (_, i) => id(100 + i))
    expect((await sendBatchReply({ threadIds: many, body: BODY, confirmCount: 26, closeThreads: false })).ok).toBe(false)
    expect((await sendBatchReply({ threadIds: [T1, T1], body: BODY, confirmCount: 2, closeThreads: false })).ok).toBe(false)
    expect(inserts).toEqual([])
  })

  it('skips closed, missing and already-sending threads and reports why', async () => {
    reads.inbox_drafts = { data: [{ thread_id: T2 }], error: null }
    const missing = id(9)
    const r = await sendBatchReply({ threadIds: [T1, T2, T3, missing], body: BODY, confirmCount: 4, closeThreads: false })
    expect(r).toMatchObject({
      ok: true,
      queued: ['draft-1'],
      skipped: [
        { threadId: T2, reason: 'already_sending' },
        { threadId: T3, reason: 'not_open' },
        { threadId: missing, reason: 'not_found' },
      ],
    })
  })

  it('a refused approve leaves that thread as a draft and carries on', async () => {
    approveDraft.mockResolvedValueOnce({ error: 'Invalid recipient.' })
    const r = await sendBatchReply({ threadIds: [T1, T2], body: BODY, confirmCount: 2, closeThreads: false })
    expect(r).toMatchObject({ ok: true, queued: ['draft-2'], skipped: [{ threadId: T1, reason: 'failed' }] })
  })

  it('sends nothing when a read fails', async () => {
    reads.inbox_messages = { data: null, error: { code: '500' } }
    const r = await sendBatchReply({ threadIds: [T1, T2], body: BODY, confirmCount: 2, closeThreads: false })
    expect(r.ok).toBe(false)
    expect(approveDraft).not.toHaveBeenCalled()
  })

  it('logs ids and counts, never an address or the body', async () => {
    approveDraft.mockResolvedValueOnce({ error: 'x' })
    await sendBatchReply({ threadIds: [T1, T2], body: BODY, confirmCount: 2, closeThreads: false })
    const logged = JSON.stringify(logSpies.map((s) => s.mock.calls))
    expect(logged).not.toContain('@example.test')
    expect(logged).not.toContain('pool')
  })
})

describe('undoBatchReply', () => {
  it('cancels each through cancelDraft and counts the ones already sent', async () => {
    cancelDraft.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ error: 'Too late' })
    const r = await undoBatchReply({ draftIds: [id(50), id(51)] })
    expect(r).toEqual({ ok: true, cancelled: 1, tooLate: 1 })
    expect(cancelDraft).toHaveBeenCalledTimes(2)
  })
})
