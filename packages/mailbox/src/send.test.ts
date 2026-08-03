import { afterEach, describe, it, expect, vi } from 'vitest'
import { buildMimeMessage, sendReply, assertNoBoundaryCollision } from './send'
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
  afterEach(() => vi.restoreAllMocks())

  function mockOk() {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'msg-1', threadId: 'thread-1' }), { status: 200 }),
    )
  }

  it('posts to the upload endpoint with uploadType=multipart', async () => {
    const fetchSpy = mockOk()
    await sendReply('at-1', 'thread-1', 'From: a@b.c\r\n\r\nhi')
    const url = String(fetchSpy.mock.calls[0][0])
    expect(url).toContain('/upload/gmail/v1/users/me/messages/send')
    expect(url).toContain('uploadType=multipart')
  })

  it('sends a related multipart carrying the threadId metadata and the rfc822 message', async () => {
    const fetchSpy = mockOk()
    await sendReply('at-1', 'thread-1', 'From: a@b.c\r\n\r\nhi')
    const init = fetchSpy.mock.calls[0][1] as RequestInit
    const contentType = String((init.headers as Record<string, string>)['Content-Type'])
    expect(contentType).toContain('multipart/related; boundary=')
    const body = String(init.body)
    expect(body).toContain('Content-Type: application/json; charset=UTF-8')
    expect(body).toContain('{"threadId":"thread-1"}')
    expect(body).toContain('Content-Type: message/rfc822')
    expect(body).toContain('From: a@b.c')
  })

  it('omits threadId from the metadata when null, so the message starts a new thread', async () => {
    const fetchSpy = mockOk()
    await sendReply('at-1', null, 'From: a@b.c\r\n\r\nhi')
    const body = String((fetchSpy.mock.calls[0][1] as RequestInit).body)
    expect(body).toContain('{}')
    expect(body).not.toContain('threadId')
  })

  it('returns the message id and thread id from the payload on success', async () => {
    mockOk()
    const result = await sendReply('at-1', 'thread-1', 'raw')
    expect(result).toEqual({ messageId: 'msg-1', threadId: 'thread-1' })
  })

  it('throws MailboxAuthError on a 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 401 }))
    await expect(sendReply('bad', 'thread-1', 'raw')).rejects.toBeInstanceOf(MailboxAuthError)
  })

  it('throws MailboxAuthError on a 403', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 403 }))
    await expect(sendReply('at-1', 'thread-1', 'raw')).rejects.toBeInstanceOf(MailboxAuthError)
  })

  it('throws a generic Error carrying the status on other non-OK responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal error', { status: 500, statusText: 'Internal Server Error' }),
    )
    await expect(sendReply('at-1', 'thread-1', 'raw')).rejects.toThrow(/500/)
  })

  it('throws when a 200 response payload has no id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ threadId: 'thread-1' }), { status: 200 }),
    )
    await expect(sendReply('at-1', 'thread-1', 'raw')).rejects.toThrow(/message id/)
  })
})

describe('buildMimeMessage — attachments', () => {
  const base = {
    from: 'hoa@example.com',
    to: ['resident@example.com'],
    subject: 'Re: Fence',
    body: 'See attached.',
    inReplyTo: null,
    references: [],
  }
  const pdf = {
    fileName: 'ccrs.pdf',
    contentType: 'application/pdf',
    bytes: Buffer.from('%PDF-1.4 fake'),
  }

  it('stays byte-identical to the single-part form when attachments is empty', () => {
    expect(buildMimeMessage({ ...base, attachments: [] })).toBe(buildMimeMessage(base))
  })

  it('declares multipart/mixed with a boundary and closes it', () => {
    const out = buildMimeMessage({ ...base, attachments: [pdf] })
    const match = out.match(/Content-Type: multipart\/mixed; boundary="([^"]+)"/)
    expect(match).not.toBeNull()
    const boundary = match![1]
    expect(out).toContain(`--${boundary}\r\n`)
    expect(out.endsWith(`--${boundary}--`)).toBe(true)
  })

  it('carries the body as the first part and the file as a base64 attachment part', () => {
    const out = buildMimeMessage({ ...base, attachments: [pdf] })
    expect(out).toContain('Content-Type: text/plain; charset="UTF-8"')
    expect(out).toContain('See attached.')
    expect(out).toContain('Content-Type: application/pdf; name="ccrs.pdf"')
    expect(out).toContain('Content-Disposition: attachment; filename="ccrs.pdf"')
    expect(out).toContain('Content-Transfer-Encoding: base64')
    expect(out).toContain(pdf.bytes.toString('base64'))
  })

  it('defaults a null contentType to application/octet-stream', () => {
    const out = buildMimeMessage({
      ...base,
      attachments: [{ ...pdf, contentType: null }],
    })
    expect(out).toContain('Content-Type: application/octet-stream; name="ccrs.pdf"')
  })

  it('wraps base64 at 76 columns', () => {
    const big = { ...pdf, bytes: Buffer.alloc(1000, 0x41) }
    const out = buildMimeMessage({ ...base, attachments: [big] })
    const payload = out.slice(out.lastIndexOf('base64\r\n\r\n') + 'base64\r\n\r\n'.length)
    for (const line of payload.split('\r\n').filter((l) => !l.startsWith('--') && l !== '')) {
      expect(line.length).toBeLessThanOrEqual(76)
    }
  })

  it('generates a fresh boundary per call', () => {
    const a = buildMimeMessage({ ...base, attachments: [pdf] })
    const b = buildMimeMessage({ ...base, attachments: [pdf] })
    const boundaryOf = (s: string) => s.match(/boundary="([^"]+)"/)![1]
    expect(boundaryOf(a)).not.toBe(boundaryOf(b))
  })

  it('keeps framing intact when the body merely resembles a boundary prefix', () => {
    // A true collision cannot be forced from outside — the boundary carries
    // 16 random bytes. What IS reachable is a body sharing the fixed prefix,
    // which must not be mistaken for a delimiter.
    const out = buildMimeMessage({
      ...base,
      body: '----=_HH_ not a real boundary',
      attachments: [pdf],
    })
    const boundary = out.match(/boundary="([^"]+)"/)![1]
    // Exactly three delimiter occurrences: open, mid, close.
    expect(out.split(`--${boundary}`).length - 1).toBe(3)
  })

  // The collision guard itself, exercised directly. `assertNoBoundaryCollision`
  // is exported for this reason and no other: the random boundary makes the
  // branch unreachable through buildMimeMessage, and an untested throw is a
  // throw nobody knows is broken.
  it('assertNoBoundaryCollision throws when a part contains the delimiter', () => {
    expect(() => assertNoBoundaryCollision(['hello --BOUND there'], 'BOUND')).toThrow(
      /boundary collision/,
    )
  })

  it('assertNoBoundaryCollision passes when no part contains the delimiter', () => {
    expect(() => assertNoBoundaryCollision(['hello there'], 'BOUND')).not.toThrow()
  })

  it('rejects CR/LF in a filename — it lands in a header parameter', () => {
    expect(() =>
      buildMimeMessage({
        ...base,
        attachments: [{ ...pdf, fileName: 'a.pdf"\r\nBcc: attacker@evil.com' }],
      }),
    ).toThrow()
  })

  it('rejects a double quote in a filename rather than escaping it', () => {
    expect(() =>
      buildMimeMessage({ ...base, attachments: [{ ...pdf, fileName: 'we"ird.pdf' }] }),
    ).toThrow()
  })

  it('rejects an empty filename', () => {
    expect(() =>
      buildMimeMessage({ ...base, attachments: [{ ...pdf, fileName: '   ' }] }),
    ).toThrow()
  })

  it('RFC 2047 encodes a non-ASCII filename', () => {
    const out = buildMimeMessage({
      ...base,
      attachments: [{ ...pdf, fileName: 'Grünanlage.pdf' }],
    })
    expect(out).toContain('=?UTF-8?B?')
    expect(out).not.toContain('filename="Grünanlage.pdf"')
  })
})
