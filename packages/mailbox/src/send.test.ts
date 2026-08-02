import { describe, it, expect } from 'vitest'
import { buildRawMessage } from './send'

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
})
