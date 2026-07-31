import { describe, expect, it, vi } from 'vitest'
import { syncMailbox } from './sync'
import { MailboxHistoryExpiredError } from './types'
import type { MailboxAccount } from './types'
import type { GmailClient } from './client'
import type { GmailApiMessage } from './parse'

const account: MailboxAccount = {
  id: 'acct-1',
  emailAddress: 'board@mp.org',
  scopeMode: 'address',
  scopeValue: 'board@mp.org',
  syncCursor: '900',
}

function rawMessage(id: string, to: string[]): GmailApiMessage {
  return {
    id,
    threadId: `t-${id}`,
    labelIds: ['INBOX'],
    internalDate: '1785500000000',
    payload: {
      mimeType: 'text/plain',
      headers: [
        { name: 'Message-ID', value: `<${id}@mail>` },
        { name: 'From', value: 'j.rivera@gmail.com' },
        { name: 'To', value: to.join(', ') },
        { name: 'Subject', value: `subject ${id}` },
      ],
      body: { size: 5, data: Buffer.from('hello').toString('base64url') },
    },
  }
}

function fakeClient(over: Partial<GmailClient> = {}): GmailClient {
  return {
    getProfile: vi.fn(async () => ({ emailAddress: 'board@mp.org', historyId: '999' })),
    listHistory: vi.fn(async () => ({
      messageIds: [],
      nextPageToken: null,
      historyId: '999',
    })),
    listMessages: vi.fn(async () => ({ messageIds: [], nextPageToken: null })),
    getMessage: vi.fn(async (id: string) => rawMessage(id, ['board@mp.org'])),
    getAttachment: vi.fn(),
    listSendAs: vi.fn(),
    listLabels: vi.fn(),
    ...over,
  } as unknown as GmailClient
}

describe('syncMailbox', () => {
  it('walks history and returns parsed messages', async () => {
    const client = fakeClient({
      listHistory: vi.fn(async () => ({
        messageIds: ['m1', 'm2'],
        nextPageToken: null,
        historyId: '950',
      })),
    })

    const result = await syncMailbox(client, account)

    expect(result.messages.map((m) => m.gmailMessageId)).toEqual(['m1', 'm2'])
    expect(result.nextCursor).toBe('950')
    expect(result.usedFallback).toBe(false)
  })

  it('drops out-of-scope messages before returning them', async () => {
    const client = fakeClient({
      listHistory: vi.fn(async () => ({
        messageIds: ['m1', 'm2'],
        nextPageToken: null,
        historyId: '950',
      })),
      getMessage: vi.fn(async (id: string) =>
        id === 'm1'
          ? rawMessage('m1', ['board@mp.org'])
          : rawMessage('m2', ['president.personal@gmail.com']),
      ),
    })

    const result = await syncMailbox(client, account)
    expect(result.messages.map((m) => m.gmailMessageId)).toEqual(['m1'])
  })

  it('follows history pagination', async () => {
    const listHistory = vi
      .fn()
      .mockResolvedValueOnce({
        messageIds: ['m1'],
        nextPageToken: 'p2',
        historyId: null,
      })
      .mockResolvedValueOnce({
        messageIds: ['m2'],
        nextPageToken: null,
        historyId: '960',
      })

    const result = await syncMailbox(fakeClient({ listHistory }), account)

    expect(listHistory).toHaveBeenCalledTimes(2)
    expect(result.messages).toHaveLength(2)
    expect(result.nextCursor).toBe('960')
  })

  it('falls back to a dated query when historyId has expired', async () => {
    const listMessages = vi.fn(async () => ({
      messageIds: ['m5'],
      nextPageToken: null,
    }))

    const client = fakeClient({
      listHistory: vi.fn(async () => {
        throw new MailboxHistoryExpiredError('gone')
      }),
      listMessages,
    })

    const result = await syncMailbox(client, account, {
      fallbackAfterDate: '2026/07/24',
    })

    expect(result.usedFallback).toBe(true)
    expect(result.messages.map((m) => m.gmailMessageId)).toEqual(['m5'])
    // Fallback must still be scope-constrained, or an expiry becomes a
    // privacy incident.
    expect(listMessages).toHaveBeenCalledWith(
      '(to:board@mp.org OR cc:board@mp.org OR deliveredto:board@mp.org) after:2026/07/24',
      undefined,
    )
    // Cursor is refreshed from the profile so the next run is incremental.
    expect(result.nextCursor).toBe('999')
  })

  it('does a first-run bootstrap when there is no cursor', async () => {
    const listMessages = vi.fn(async () => ({
      messageIds: ['m7'],
      nextPageToken: null,
    }))
    const client = fakeClient({ listMessages })

    const result = await syncMailbox(
      client,
      { ...account, syncCursor: null },
      { fallbackAfterDate: '2026/07/01' },
    )

    expect(result.usedFallback).toBe(true)
    expect(result.messages).toHaveLength(1)
    expect(result.nextCursor).toBe('999')
  })

  it('honours maxMessages so one run cannot blow the function timeout', async () => {
    const client = fakeClient({
      listHistory: vi.fn(async () => ({
        messageIds: ['m1', 'm2', 'm3', 'm4'],
        nextPageToken: null,
        historyId: '950',
      })),
    })

    const result = await syncMailbox(client, account, { maxMessages: 2 })
    expect(result.messages).toHaveLength(2)
    expect(result.truncated).toBe(true)
    // History path: cursor is HELD so the remainder is picked up next run
    // rather than silently skipped.
    expect(result.nextCursor).toBe('900')
  })

  it('advances the cursor on a truncated FALLBACK run and reports truncation', async () => {
    // Holding a null/stale cursor here would re-fetch the same newest N
    // forever. The cursor must advance, and the caller must backfill to
    // cover what the cap dropped.
    const client = fakeClient({
      listMessages: vi.fn(async () => ({
        messageIds: ['m1', 'm2', 'm3', 'm4'],
        nextPageToken: null,
      })),
    })

    const result = await syncMailbox(
      client,
      { ...account, syncCursor: null },
      { fallbackAfterDate: '2026/07/01', maxMessages: 2 },
    )

    expect(result.usedFallback).toBe(true)
    expect(result.truncated).toBe(true)
    expect(result.messages).toHaveLength(2)
    expect(result.nextCursor).toBe('999')
  })

  it('returns no messages and holds the cursor when history is empty', async () => {
    const result = await syncMailbox(fakeClient(), account)
    expect(result.messages).toEqual([])
    expect(result.nextCursor).toBe('999')
  })
})
