import { afterEach, describe, it, expect, vi } from 'vitest'
import { buildMimeMessage, sendReply } from './send'
import { MailboxAuthError } from './types'

describe('buildMimeMessage — single part', () => {
  const base = {
    from: 'hoa@example.com',
    to: ['resident@example.com'],
    subject: 'Re: Fence',
    body: 'Thanks for writing.',
    inReplyTo: '<abc@mail.gmail.com>',
    references: ['<abc@mail.gmail.com>'],
  }

  // GOLDEN TEST — pins the exact byte layout of the no-attachment path so a
  // later multipart change cannot silently alter ordinary replies.
  it('emits the exact expected RFC822 message', () => {
    expect(buildMimeMessage(base)).toBe(
      [
        'From: hoa@example.com',
        'To: resident@example.com',
        'Subject: Re: Fence',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: 8bit',
        'In-Reply-To: <abc@mail.gmail.com>',
        'References: <abc@mail.gmail.com>',
        '',
        'Thanks for writing.',
      ].join('\r\n'),
    )
  })

  it('omits threading headers on a first message rather than emitting empty ones', () => {
    const out = buildMimeMessage({ ...base, inReplyTo: null, references: [] })
    expect(out).not.toContain('In-Reply-To:')
    expect(out).not.toContain('References:')
  })

  it('encodes a non-ASCII subject so it is not mangled', () => {
    const out = buildMimeMessage({ ...base, subject: 'Re: Grünanlage' })
    expect(out).toContain('=?UTF-8?B?')
    expect(out).not.toContain('Subject: Re: Grünanlage')
  })

  it('rejects a header-injection attempt in the subject', () => {
    expect(() => buildMimeMessage({ ...base, subject: 'Hi\r\nBcc: attacker@evil.com' })).toThrow()
  })
})

describe('buildMimeMessage — Cc', () => {
  const base = {
    from: 'hoa@example.com',
    to: ['resident@example.com'],
    subject: 'Re: Fence',
    body: 'Thanks.',
    inReplyTo: null,
    references: [],
  }

  it('emits a Cc header listing every address', () => {
    const out = buildMimeMessage({ ...base, cc: ['pm@example.com', 'board@example.com'] })
    expect(out).toContain('Cc: pm@example.com, board@example.com')
  })

  it('omits Cc entirely when empty', () => {
    expect(buildMimeMessage({ ...base, cc: [] })).not.toContain('Cc:')
  })

  it('rejects CR/LF in a Cc address', () => {
    expect(() =>
      buildMimeMessage({ ...base, cc: ['ok@example.com\r\nBcc: attacker@evil.com'] }),
    ).toThrow()
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
