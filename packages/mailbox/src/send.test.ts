import { afterEach, describe, it, expect, vi } from 'vitest'
import { buildRawMessage, sendReply } from './send'
import { MailboxAuthError } from './types'

function decode(raw: string): string {
  return Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

describe('buildRawMessage', () => {
  const base = {
    from: 'hoa@example.com',
    to: ['resident@example.com'],
    subject: 'Re: Fence',
    body: 'Thanks for writing.',
    inReplyTo: '<abc@mail.gmail.com>',
    references: ['<abc@mail.gmail.com>'],
  }

  it('threads the reply with In-Reply-To and References', () => {
    const decoded = decode(buildRawMessage(base))
    expect(decoded).toContain('In-Reply-To: <abc@mail.gmail.com>')
    expect(decoded).toContain('References: <abc@mail.gmail.com>')
  })

  it('omits threading headers on a first message rather than emitting empty ones', () => {
    const decoded = decode(buildRawMessage({ ...base, inReplyTo: null, references: [] }))
    expect(decoded).not.toContain('In-Reply-To:')
    expect(decoded).not.toContain('References:')
  })

  it('encodes a non-ASCII subject so it is not mangled', () => {
    const decoded = decode(buildRawMessage({ ...base, subject: 'Re: Grünanlage' }))
    expect(decoded).toContain('=?UTF-8?B?')
    expect(decoded).not.toContain('Subject: Re: Grünanlage')
  })

  it('is base64url — no +, / or = that would break the Gmail API', () => {
    const raw = buildRawMessage(base)
    expect(raw).not.toMatch(/[+/=]/)
  })

  it('rejects a header-injection attempt in the subject', () => {
    expect(() =>
      buildRawMessage({ ...base, subject: 'Hi\r\nBcc: attacker@evil.com' }),
    ).toThrow()
  })

  it('declares an 8bit transfer encoding for the UTF-8 body', () => {
    const decoded = decode(buildRawMessage(base))
    expect(decoded).toContain('Content-Transfer-Encoding: 8bit')
  })
})

describe('sendReply', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the message id and thread id from the payload on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'msg-1', threadId: 'thread-1' }), { status: 200 }),
    )

    const result = await sendReply('at-1', 'thread-1', 'raw-message')
    expect(result).toEqual({ messageId: 'msg-1', threadId: 'thread-1' })
  })

  it('throws MailboxAuthError on a 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Invalid Credentials' } }), {
        status: 401,
      }),
    )

    await expect(sendReply('bad', 'thread-1', 'raw-message')).rejects.toBeInstanceOf(
      MailboxAuthError,
    )
  })

  it('throws MailboxAuthError on a 403', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Forbidden' } }), { status: 403 }),
    )

    await expect(sendReply('at-1', 'thread-1', 'raw-message')).rejects.toBeInstanceOf(
      MailboxAuthError,
    )
  })

  it('throws a generic Error carrying the status on other non-OK responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal error', { status: 500, statusText: 'Internal Server Error' }),
    )

    await expect(sendReply('at-1', 'thread-1', 'raw-message')).rejects.toThrow(/500/)
  })

  it('throws when a 200 response payload has no id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ threadId: 'thread-1' }), { status: 200 }),
    )

    await expect(sendReply('at-1', 'thread-1', 'raw-message')).rejects.toThrow(/message id/)
  })
})
