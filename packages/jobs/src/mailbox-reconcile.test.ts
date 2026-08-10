import { describe, expect, it, vi } from 'vitest'
import { reconcileAccountGmailState } from './mailbox-reconcile'
import type { GmailClient } from '@homeowner-portal/mailbox'

const account = {
  id: 'acct-1',
  scopeMode: 'address' as const,
  scopeValue: 'board@mp.org',
}

const SCOPE =
  '(to:board@mp.org OR cc:board@mp.org OR deliveredto:board@mp.org OR from:board@mp.org)'

/** A Gmail double whose list results are keyed by the query string. */
function fakeClient(byQuery: Record<string, { ids: string[]; next: string | null }[]>): GmailClient {
  const cursors = new Map<string, number>()
  return {
    listMessages: vi.fn(async (query: string, pageToken?: string) => {
      if (!pageToken) cursors.set(query, 0)
      const index = cursors.get(query) ?? 0
      const page = (byQuery[query] ?? [{ ids: [], next: null }])[index] ?? {
        ids: [],
        next: null,
      }
      cursors.set(query, index + 1)
      return { messageIds: page.ids, nextPageToken: page.next, resultSizeEstimate: null }
    }),
  } as unknown as GmailClient
}

interface StoredMessage {
  id: string
  gmail_message_id: string
  gmail_state: string
  thread_id: string
}

interface Write {
  table: string
  patch: Record<string, unknown>
  ids: string[]
}

/**
 * A Supabase double covering exactly the four shapes this function uses:
 * a paged read of inbox_messages, a batched read of inbox_threads, and an
 * `update(...).in('id', …)` against either table.
 *
 * Records every write so a test can assert that a refused run wrote
 * NOTHING — which is the property that actually matters here.
 */
function fakeDb(messages: StoredMessage[], threads: Record<string, string>) {
  const writes: Write[] = []

  const from = vi.fn((table: string) => {
    const state: {
      op: 'select' | 'update'
      patch: Record<string, unknown>
      gt: string
      inIds: string[] | null
    } = { op: 'select', patch: {}, gt: '', inIds: null }

    const result = () => {
      if (state.op === 'update') {
        writes.push({ table, patch: state.patch, ids: state.inIds ?? [] })
        return { data: null, error: null }
      }
      if (table === 'inbox_messages') {
        const page = messages
          .filter((m) => m.id > state.gt)
          .sort((a, b) => a.id.localeCompare(b.id))
        return { data: page, error: null }
      }
      const ids = state.inIds ?? []
      return {
        data: ids.map((id) => ({ id, gmail_state: threads[id] ?? 'unknown' })),
        error: null,
      }
    }

    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      update: vi.fn((patch: Record<string, unknown>) => {
        state.op = 'update'
        state.patch = patch
        return chain
      }),
      eq: vi.fn(() => chain),
      gt: vi.fn((_col: string, value: string) => {
        state.gt = value
        return chain
      }),
      in: vi.fn((_col: string, values: string[]) => {
        state.inIds = values
        return chain
      }),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      then: (resolve: (r: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    }
    return chain
  })

  return { db: { from } as never, writes }
}

describe('reconcileAccountGmailState', () => {
  it('restates a filed message and archives its thread', async () => {
    // m1 is still in the Gmail inbox, m2 was moved to a folder. The board
    // filed m2's thread, so that thread must leave the working inbox.
    const client = fakeClient({
      [`${SCOPE} in:inbox`]: [{ ids: ['g1'], next: null }],
      [`${SCOPE} in:trash`]: [{ ids: [], next: null }],
    })
    const { db, writes } = fakeDb(
      [
        { id: 'm1', gmail_message_id: 'g1', gmail_state: 'unknown', thread_id: 't1' },
        { id: 'm2', gmail_message_id: 'g2', gmail_state: 'unknown', thread_id: 't2' },
      ],
      { t1: 'unknown', t2: 'unknown' },
    )

    const summary = await reconcileAccountGmailState(db, client, account)

    expect(summary.applied).toBe(true)
    expect(summary.messagesScanned).toBe(2)
    expect(summary.messagesChanged).toBe(2)
    expect(summary.threadStateCounts).toMatchObject({ active: 1, archived: 1 })

    const threadWrites = writes.filter((w) => w.table === 'inbox_threads')
    expect(threadWrites).toContainEqual(
      expect.objectContaining({ patch: { gmail_state: 'archived' }, ids: ['t2'] }),
    )
    expect(threadWrites).toContainEqual(
      expect.objectContaining({ patch: { gmail_state: 'active' }, ids: ['t1'] }),
    )
  })

  it('classifies trashed mail separately from filed mail', async () => {
    const client = fakeClient({
      [`${SCOPE} in:inbox`]: [{ ids: [], next: null }],
      [`${SCOPE} in:trash`]: [{ ids: ['g2'], next: null }],
    })
    const { db, writes } = fakeDb(
      [{ id: 'm2', gmail_message_id: 'g2', gmail_state: 'unknown', thread_id: 't2' }],
      { t2: 'unknown' },
    )

    const summary = await reconcileAccountGmailState(db, client, account)

    expect(summary.threadStateCounts.trashed).toBe(1)
    expect(writes.filter((w) => w.table === 'inbox_threads')).toContainEqual(
      expect.objectContaining({ patch: { gmail_state: 'trashed' }, ids: ['t2'] }),
    )
  })

  it('REFUSES to write anything when the Gmail snapshot is incomplete', async () => {
    // The fail-safe, and the single most important test in this file.
    // "Archived" is derived from ABSENCE from the inbox set. If that set
    // was truncated, every message past the cap looks absent — applying it
    // would hide a board's entire live inbox in one run.
    const client = fakeClient({
      [`${SCOPE} in:inbox`]: [
        { ids: ['g1'], next: 'p2' },
        { ids: ['g2'], next: 'p3' },
      ],
    })
    const { db, writes } = fakeDb(
      [
        { id: 'm1', gmail_message_id: 'g1', gmail_state: 'inbox', thread_id: 't1' },
        { id: 'm9', gmail_message_id: 'g9', gmail_state: 'inbox', thread_id: 't9' },
      ],
      { t1: 'active', t9: 'active' },
    )

    const summary = await reconcileAccountGmailState(db, client, account, { maxPages: 2 })

    expect(summary.applied).toBe(false)
    expect(summary.skipReason).toMatch(/more mail than one reconciliation pass can read/)
    expect(writes).toEqual([])
  })

  it('writes nothing in a dry run but still reports what would change', async () => {
    const client = fakeClient({
      [`${SCOPE} in:inbox`]: [{ ids: [], next: null }],
      [`${SCOPE} in:trash`]: [{ ids: [], next: null }],
    })
    const { db, writes } = fakeDb(
      [{ id: 'm1', gmail_message_id: 'g1', gmail_state: 'inbox', thread_id: 't1' }],
      { t1: 'active' },
    )

    const summary = await reconcileAccountGmailState(db, client, account, { dryRun: true })

    expect(summary.applied).toBe(false)
    expect(summary.messagesChanged).toBe(1)
    expect(summary.threadsChanged).toBe(1)
    expect(writes).toEqual([])
  })

  it('writes nothing when everything already agrees with Gmail', async () => {
    // The steady state, once a mailbox has been reconciled once. A version
    // that rewrote every row every 15 minutes would look identical in
    // behaviour but hammer the database forever.
    const client = fakeClient({
      [`${SCOPE} in:inbox`]: [{ ids: ['g1'], next: null }],
      [`${SCOPE} in:trash`]: [{ ids: [], next: null }],
    })
    const { db, writes } = fakeDb(
      [{ id: 'm1', gmail_message_id: 'g1', gmail_state: 'inbox', thread_id: 't1' }],
      { t1: 'active' },
    )

    const summary = await reconcileAccountGmailState(db, client, account)

    expect(summary.applied).toBe(true)
    expect(summary.messagesChanged).toBe(0)
    expect(summary.threadsChanged).toBe(0)
    expect(writes).toEqual([])
  })

  it('keeps a thread active while any one of its inbound messages is still in the inbox', async () => {
    // The rollup rule that stops a half-filed thread from disappearing.
    const client = fakeClient({
      [`${SCOPE} in:inbox`]: [{ ids: ['g2'], next: null }],
      [`${SCOPE} in:trash`]: [{ ids: [], next: null }],
    })
    const { db } = fakeDb(
      [
        { id: 'm1', gmail_message_id: 'g1', gmail_state: 'unknown', thread_id: 't1' },
        { id: 'm2', gmail_message_id: 'g2', gmail_state: 'unknown', thread_id: 't1' },
      ],
      { t1: 'unknown' },
    )

    const summary = await reconcileAccountGmailState(db, client, account)

    expect(summary.threadStateCounts).toMatchObject({ active: 1, archived: 0 })
  })

  it('does not write gmail_labels — a membership snapshot is not a label list', async () => {
    const client = fakeClient({
      [`${SCOPE} in:inbox`]: [{ ids: [], next: null }],
      [`${SCOPE} in:trash`]: [{ ids: [], next: null }],
    })
    const { db, writes } = fakeDb(
      [{ id: 'm1', gmail_message_id: 'g1', gmail_state: 'inbox', thread_id: 't1' }],
      { t1: 'active' },
    )

    await reconcileAccountGmailState(db, client, account)

    const messageWrites = writes.filter((w) => w.table === 'inbox_messages')
    expect(messageWrites.length).toBeGreaterThan(0)
    for (const write of messageWrites) {
      expect(write.patch).not.toHaveProperty('gmail_labels')
      expect(write.patch).toHaveProperty('gmail_state')
    }
  })
})
