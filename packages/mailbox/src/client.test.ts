import { afterEach, describe, expect, it, vi } from 'vitest'
import { GmailClient } from './client'
import { MailboxAuthError, MailboxHistoryExpiredError } from './types'

afterEach(() => vi.unstubAllGlobals())

function stubJson(payload: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => new Response(JSON.stringify(payload), { status }))
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('GmailClient', () => {
  it('sends the bearer token', async () => {
    const fetchMock = stubJson({ emailAddress: 'board@mp.org', historyId: '900' })
    await new GmailClient('at-1').getProfile()

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer at-1')
  })

  it('throws MailboxAuthError on 401', async () => {
    stubJson({ error: { message: 'Invalid Credentials' } }, 401)
    await expect(new GmailClient('bad').getProfile()).rejects.toBeInstanceOf(
      MailboxAuthError,
    )
  })

  it('throws MailboxHistoryExpiredError on a 404 from listHistory', async () => {
    stubJson({ error: { message: 'Requested entity was not found.' } }, 404)
    await expect(new GmailClient('at').listHistory('123')).rejects.toBeInstanceOf(
      MailboxHistoryExpiredError,
    )
  })

  it('flattens messagesAdded into a deduped id list', async () => {
    stubJson({
      history: [
        { messagesAdded: [{ message: { id: 'm1' } }, { message: { id: 'm2' } }] },
        { messagesAdded: [{ message: { id: 'm2' } }, { message: { id: 'm3' } }] },
        { labelsRemoved: [{ message: { id: 'm9' } }] },
      ],
      historyId: '950',
      nextPageToken: 'tok',
    })

    const result = await new GmailClient('at').listHistory('900')
    // m9 only had a label change — not a new message.
    expect(result.messageIds).toEqual(['m1', 'm2', 'm3'])
    expect(result.nextPageToken).toBe('tok')
    expect(result.historyId).toBe('950')
  })

  it('returns an empty list when history has no entries', async () => {
    stubJson({ historyId: '900' })
    const result = await new GmailClient('at').listHistory('900')
    expect(result.messageIds).toEqual([])
    expect(result.nextPageToken).toBeNull()
  })

  it('passes the search query to listMessages', async () => {
    const fetchMock = stubJson({ messages: [{ id: 'm1' }], nextPageToken: null })
    await new GmailClient('at').listMessages('after:2025/07/31')

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('q=after%3A2025%2F07%2F31')
  })

  it('defaults listMessages maxResults to 100 when not given', async () => {
    const fetchMock = stubJson({ messages: [], nextPageToken: null })
    await new GmailClient('at').listMessages('after:2025/07/31')

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('maxResults=100')
  })

  it('sends the maxResults value it was given', async () => {
    const fetchMock = stubJson({ messages: [], nextPageToken: null })
    await new GmailClient('at').listMessages('after:2025/07/31', undefined, 50)

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('maxResults=50')
  })

  it('surfaces resultSizeEstimate from listMessages as an estimate, not a count', async () => {
    stubJson({ messages: [{ id: 'm1' }], nextPageToken: null, resultSizeEstimate: 3800 })
    const result = await new GmailClient('at').listMessages('after:2025/07/31')
    expect(result.resultSizeEstimate).toBe(3800)
  })

  it('returns null resultSizeEstimate when Gmail omits it', async () => {
    stubJson({ messages: [{ id: 'm1' }], nextPageToken: null })
    const result = await new GmailClient('at').listMessages('after:2025/07/31')
    expect(result.resultSizeEstimate).toBeNull()
  })

  it('decodes attachment bytes from base64url', async () => {
    const original = Buffer.from('PDF-BYTES')
    stubJson({ data: original.toString('base64url'), size: original.length })

    const bytes = await new GmailClient('at').getAttachment('m1', 'a1')
    expect(bytes.toString('utf8')).toBe('PDF-BYTES')
  })

  it('surfaces the Google error message on a non-retryable failure', async () => {
    stubJson({ error: { message: 'Insufficient Permission' } }, 403)
    await expect(new GmailClient('at').getProfile()).rejects.toThrow(
      /Insufficient Permission/,
    )
  })

  it('retries a 429 and succeeds when the limit clears', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Rate Limit' } }), { status: 429 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ emailAddress: 'board@mp.org', historyId: '900' }), {
          status: 200,
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const profile = await new GmailClient('at').getProfile()
    expect(profile.emailAddress).toBe('board@mp.org')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry a 401 — dead credentials must fail fast', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'Invalid Credentials' } }), {
          status: 401,
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(new GmailClient('bad').getProfile()).rejects.toBeInstanceOf(
      MailboxAuthError,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws when getAttachment response has no data field', async () => {
    stubJson({ size: 1024 })
    await expect(new GmailClient('at').getAttachment('m1', 'a1')).rejects.toThrow(
      /Attachment data missing or invalid for message m1 attachment a1/,
    )
  })

  it('throws when getAttachment data is not a string', async () => {
    stubJson({ data: null, size: 1024 })
    await expect(new GmailClient('at').getAttachment('m1', 'a1')).rejects.toThrow(
      /Attachment data missing or invalid for message m1 attachment a1/,
    )
  })

  it('throws Error (not MailboxHistoryExpiredError) on a 404 from getMessage', async () => {
    stubJson({ error: { message: 'Requested entity was not found.' } }, 404)
    try {
      await new GmailClient('at').getMessage('m1')
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect(err).not.toBeInstanceOf(MailboxHistoryExpiredError)
    }
  })
})
