import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * BL-101 A3/A6 — what approving a reply does to its thread:
 *   - "Approve and send" closes it through the existing setThreadStatus;
 *   - "Approve, keep open" (and every older caller) leaves status alone;
 *   - replying to an unassigned thread assigns it to the replier, only
 *     where nobody owns it yet;
 *   - Undo puts a closed thread back in the queue.
 * The reply itself is queued exactly as before; nothing is sent here.
 */

vi.mock('@/lib/org-owned', () => ({ checkOrgOwned: vi.fn(async () => 'owned') }))
vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => ({
    role: 'board' as const,
    org: { id: 'org-1', name: 'Madison Park', hub_type: 'hoa', plan: 'pro', doors_count: 120 },
  })),
}))
vi.mock('@homeowner-portal/jobs', () => ({ inngest: { send: vi.fn() } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const setThreadStatus = vi.fn(async (_prev: unknown, _form: FormData) => ({ ok: true }) as { ok?: boolean; error?: string })
vi.mock('@/lib/inbox/actions', () => ({
  setThreadStatus: (prev: unknown, form: FormData) => setThreadStatus(prev, form),
}))

type Call = { table: string; op: string; args: unknown[] }
const calls: Call[] = []

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn((table: string) => {
      const record =
        (op: string) =>
        (...args: unknown[]) => {
          calls.push({ table, op, args })
          return chain
        }
      const chain: Record<string, unknown> = {
        update: record('update'),
        eq: record('eq'),
        is: record('is'),
        select: record('select'),
        maybeSingle: vi.fn(async () => ({ data: { id: 'draft-1', thread_id: 'thread-1' }, error: null })),
        then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: [], error: null }),
      }
      return chain
    }),
  })),
}))

import { approveDraft, cancelDraft } from './actions'

const valid = { subject: 'Re: Fence', body: 'Thanks for writing.', to: ['resident@example.com'], cc: [] as string[] }

function threadOps() {
  return calls.filter((c) => c.table === 'inbox_threads')
}

describe('approveDraft — thread effects', () => {
  beforeEach(() => {
    calls.length = 0
    setThreadStatus.mockClear()
  })

  it('"Approve and send" closes the thread through setThreadStatus after queueing', async () => {
    const result = await approveDraft('draft-1', valid, { closeThread: true })
    expect(result).toMatchObject({ ok: true, threadClosed: true })
    expect(setThreadStatus).toHaveBeenCalledTimes(1)
    const form = setThreadStatus.mock.calls[0][1]
    expect(form.get('threadId')).toBe('thread-1')
    expect(form.get('status')).toBe('closed')
    // The draft was queued first.
    const firstUpdate = calls.find((c) => c.op === 'update')
    expect(firstUpdate?.table).toBe('inbox_drafts')
  })

  it('"Approve, keep open" and older callers leave the status alone', async () => {
    expect(await approveDraft('draft-1', valid, { closeThread: false })).toMatchObject({ threadClosed: false })
    expect(await approveDraft('draft-1', valid)).toMatchObject({ threadClosed: false })
    expect(setThreadStatus).not.toHaveBeenCalled()
  })

  it('a failed close does not fail the approve — the reply is already queued', async () => {
    setThreadStatus.mockResolvedValueOnce({ error: 'Could not update status. Try again.' })
    expect(await approveDraft('draft-1', valid, { closeThread: true })).toMatchObject({ ok: true, threadClosed: false })
  })

  it('assigns an unassigned thread to the replier, conditional on nobody owning it', async () => {
    await approveDraft('draft-1', valid)
    const ops = threadOps()
    expect(ops).toContainEqual({ table: 'inbox_threads', op: 'update', args: [{ assigned_to: 'user-1' }] })
    expect(ops).toContainEqual({ table: 'inbox_threads', op: 'is', args: ['assigned_to', null] })
    expect(ops).toContainEqual({ table: 'inbox_threads', op: 'eq', args: ['organization_id', 'org-1'] })
  })

  it('still refuses a draft with a blank and touches no thread', async () => {
    const result = await approveDraft('draft-1', { ...valid, body: 'You owe [[BLANK: money]].' }, { closeThread: true })
    expect('error' in result).toBe(true)
    expect(threadOps()).toHaveLength(0)
    expect(setThreadStatus).not.toHaveBeenCalled()
  })
})

describe('cancelDraft — Undo reopens a closed thread', () => {
  beforeEach(() => {
    calls.length = 0
  })

  it('moves the thread from closed back to needs_review, conditionally', async () => {
    expect(await cancelDraft('draft-1')).toEqual({ ok: true })
    const ops = threadOps()
    expect(ops).toContainEqual({ table: 'inbox_threads', op: 'update', args: [{ status: 'needs_review' }] })
    expect(ops).toContainEqual({ table: 'inbox_threads', op: 'eq', args: ['status', 'closed'] })
    expect(ops).toContainEqual({ table: 'inbox_threads', op: 'eq', args: ['organization_id', 'org-1'] })
  })
})
