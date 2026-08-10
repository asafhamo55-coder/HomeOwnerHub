import { describe, expect, it, vi } from 'vitest'
import { fetchGmailStateSnapshot, resolveMessageState } from './reconcile'
import type { GmailClient } from './client'
import type { MailboxAccount } from './types'

const account: Pick<MailboxAccount, 'scopeMode' | 'scopeValue'> = {
  scopeMode: 'address',
  scopeValue: 'board@mp.org',
}

/**
 * A fake whose `listMessages` answers per query string, so a test can set
 * up the inbox and trash sides independently — which is the only way to
 * exercise the "one half truncated" case that drives `complete`.
 */
function fakeClient(pages: Record<string, Array<{ ids: string[]; next: string | null }>>): {
  client: GmailClient
  queries: string[]
} {
  const queries: string[] = []
  const cursors = new Map<string, number>()

  const listMessages = vi.fn(async (query: string, pageToken?: string) => {
    if (!pageToken) {
      queries.push(query)
      cursors.set(query, 0)
    }
    const index = cursors.get(query) ?? 0
    const page = (pages[query] ?? [{ ids: [], next: null }])[index] ?? { ids: [], next: null }
    cursors.set(query, index + 1)
    return { messageIds: page.ids, nextPageToken: page.next, resultSizeEstimate: null }
  })

  return {
    client: { listMessages } as unknown as GmailClient,
    queries,
  }
}

const SCOPE = '(to:board@mp.org OR cc:board@mp.org OR deliveredto:board@mp.org OR from:board@mp.org)'

describe('fetchGmailStateSnapshot', () => {
  it('collects inbox and trash ids under the account scope', async () => {
    const { client, queries } = fakeClient({
      [`${SCOPE} in:inbox`]: [{ ids: ['m1', 'm2'], next: null }],
      [`${SCOPE} in:trash`]: [{ ids: ['m9'], next: null }],
    })

    const snapshot = await fetchGmailStateSnapshot(client, account)

    expect([...snapshot.inboxIds]).toEqual(['m1', 'm2'])
    expect([...snapshot.trashIds]).toEqual(['m9'])
    expect(snapshot.complete).toBe(true)
    // Scope is not an optimization here — an unscoped query would return
    // ids for personal mail in a shared board mailbox.
    expect(queries).toEqual([`${SCOPE} in:inbox`, `${SCOPE} in:trash`])
  })

  it('paginates until the page token runs out', async () => {
    const { client } = fakeClient({
      [`${SCOPE} in:inbox`]: [
        { ids: ['m1'], next: 'p2' },
        { ids: ['m2'], next: 'p3' },
        { ids: ['m3'], next: null },
      ],
    })

    const snapshot = await fetchGmailStateSnapshot(client, account)

    expect([...snapshot.inboxIds]).toEqual(['m1', 'm2', 'm3'])
    expect(snapshot.complete).toBe(true)
  })

  it('reports incomplete when the inbox query hits the page cap', async () => {
    // The critical fail-safe. A truncated inbox set means every message
    // past the cap looks absent, i.e. archived — applying that would hide
    // a board's whole live inbox in a single run.
    const { client } = fakeClient({
      [`${SCOPE} in:inbox`]: [
        { ids: ['m1'], next: 'p2' },
        { ids: ['m2'], next: 'p3' },
      ],
    })

    const snapshot = await fetchGmailStateSnapshot(client, account, { maxPages: 2 })

    expect(snapshot.complete).toBe(false)
    expect(snapshot.inboxIds.size).toBe(2)
  })

  it('reports incomplete when only the trash query hits the page cap', async () => {
    const { client } = fakeClient({
      [`${SCOPE} in:inbox`]: [{ ids: ['m1'], next: null }],
      [`${SCOPE} in:trash`]: [
        { ids: ['m8'], next: 'p2' },
        { ids: ['m9'], next: 'p3' },
      ],
    })

    const snapshot = await fetchGmailStateSnapshot(client, account, { maxPages: 2 })

    expect(snapshot.complete).toBe(false)
  })

  it('queries bare in:inbox / in:trash for an unscoped mailbox', async () => {
    const { client, queries } = fakeClient({})

    await fetchGmailStateSnapshot(client, { scopeMode: 'all', scopeValue: null })

    expect(queries).toEqual(['in:inbox', 'in:trash'])
  })

  it('counts pages across both queries for cost logging', async () => {
    const { client } = fakeClient({
      [`${SCOPE} in:inbox`]: [
        { ids: ['m1'], next: 'p2' },
        { ids: ['m2'], next: null },
      ],
      [`${SCOPE} in:trash`]: [{ ids: [], next: null }],
    })

    const snapshot = await fetchGmailStateSnapshot(client, account)

    expect(snapshot.pagesFetched).toBe(3)
  })
})

describe('resolveMessageState', () => {
  const snapshot = {
    inboxIds: new Set(['m1']),
    trashIds: new Set(['m2']),
    complete: true,
    pagesFetched: 2,
  }

  it('resolves a message still in the inbox', () => {
    expect(resolveMessageState('m1', snapshot)).toBe('inbox')
  })

  it('resolves a trashed message', () => {
    expect(resolveMessageState('m2', snapshot)).toBe('trashed')
  })

  it('resolves an absent message as archived', () => {
    expect(resolveMessageState('m3', snapshot)).toBe('archived')
  })
})
