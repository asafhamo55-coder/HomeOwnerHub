import { describe, expect, it } from 'vitest'
import { buildScopeQuery, isInScope, recommendScope } from './scope'
import type { ParsedMessage, ScopeMode } from './types'

function msg(over: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    gmailMessageId: 'm1',
    gmailThreadId: 't1',
    rfc822MessageId: null,
    inReplyTo: null,
    references: [],
    fromEmail: 'j.rivera@gmail.com',
    fromName: 'Jenna',
    toEmails: ['board@mp.org'],
    ccEmails: [],
    deliveredTo: [],
    subject: 'hi',
    bodyText: 'hi',
    bodyHtml: null,
    strippedText: 'hi',
    attachments: [],
    sentAt: null,
    labelIds: ['INBOX'],
    ...over,
  }
}

describe('isInScope', () => {
  it('mode=all keeps everything', () => {
    expect(isInScope(msg({ toEmails: ['someone@else.com'] }), 'all', null)).toBe(true)
  })

  it('mode=address keeps mail addressed To the scoped address', () => {
    expect(isInScope(msg({ toEmails: ['board@mp.org'] }), 'address', 'board@mp.org')).toBe(
      true,
    )
  })

  it('mode=address keeps mail Cc-ed to the scoped address', () => {
    expect(
      isInScope(
        msg({ toEmails: ['other@x.com'], ccEmails: ['board@mp.org'] }),
        'address',
        'board@mp.org',
      ),
    ).toBe(true)
  })

  it('mode=address keeps mail routed via Delivered-To (Google Group fan-out)', () => {
    // The critical case: a Group delivers to a personal inbox, so the
    // group address appears ONLY in Delivered-To, never in To.
    expect(
      isInScope(
        msg({ toEmails: ['president.personal@gmail.com'], deliveredTo: ['board@mp.org'] }),
        'address',
        'board@mp.org',
      ),
    ).toBe(true)
  })

  it('mode=address REJECTS unrelated personal mail', () => {
    // The whole point: a connected personal Gmail must not leak private
    // correspondence into a shared board tool.
    expect(
      isInScope(
        msg({ toEmails: ['president.personal@gmail.com'], fromEmail: 'doctor@clinic.com' }),
        'address',
        'board@mp.org',
      ),
    ).toBe(false)
  })

  it('mode=address is case-insensitive (haystack side)', () => {
    expect(isInScope(msg({ toEmails: ['BOARD@MP.ORG'] }), 'address', 'board@mp.org')).toBe(
      true,
    )
  })

  it('mode=address is case-insensitive (needle side)', () => {
    // The fixture haystack is lowercase; if the needle-side .toLowerCase()
    // were removed, this would fail while the test above still passed.
    expect(isInScope(msg({ toEmails: ['board@mp.org'] }), 'address', 'BOARD@MP.ORG')).toBe(
      true,
    )
  })

  it('mode=address with no scopeValue rejects everything rather than leaking', () => {
    // Fail closed. A misconfigured scope must not silently become "all".
    expect(isInScope(msg(), 'address', null)).toBe(false)
  })

  it('mode=address with an empty-string scopeValue rejects everything', () => {
    expect(isInScope(msg(), 'address', '')).toBe(false)
  })

  it('mode=address with a whitespace-only scopeValue rejects everything', () => {
    expect(isInScope(msg(), 'address', '   ')).toBe(false)
  })

  it('mode=label keeps a message carrying the label', () => {
    expect(isInScope(msg({ labelIds: ['INBOX', 'Label_9'] }), 'label', 'Label_9')).toBe(true)
  })

  it('mode=label rejects a message without the label', () => {
    expect(isInScope(msg({ labelIds: ['INBOX'] }), 'label', 'Label_9')).toBe(false)
  })

  it('an unrecognized scopeMode fails closed rather than falling through to address matching', () => {
    expect(
      isInScope(msg({ toEmails: ['board@mp.org'] }), 'bogus' as ScopeMode, 'board@mp.org'),
    ).toBe(false)
  })
})

describe('buildScopeQuery', () => {
  it('scopes by deliveredto for address mode', () => {
    expect(buildScopeQuery('address', 'board@mp.org')).toBe(
      '(to:board@mp.org OR cc:board@mp.org OR deliveredto:board@mp.org OR from:board@mp.org)',
    )
  })

  it('scopes by label for label mode', () => {
    expect(buildScopeQuery('label', 'Label_9')).toBe('label:Label_9')
  })

  it('returns an empty query for all mode', () => {
    expect(buildScopeQuery('all', null)).toBe('')
  })

  it('appends an after: clause when given', () => {
    expect(buildScopeQuery('all', null, '2025/07/31')).toBe('after:2025/07/31')
    expect(buildScopeQuery('label', 'L1', '2025/07/31')).toBe('label:L1 after:2025/07/31')
  })

  it('rejects a query-widening address instead of building an unrestricted query', () => {
    // A bare space plus Gmail query syntax would turn the fetch-side
    // filter into "match essentially every message with a To: header".
    expect(() => buildScopeQuery('address', 'x@y.com OR to:*')).toThrow(/scopeValue/)
  })

  it('rejects a label value containing a space', () => {
    expect(() => buildScopeQuery('label', 'Label 9')).toThrow(/scopeValue/)
  })

  it('rejects a label value containing a colon', () => {
    expect(() => buildScopeQuery('label', 'label:evil')).toThrow(/scopeValue/)
  })

  it('rejects an unrecognized scopeMode instead of degrading to an unrestricted query', () => {
    expect(() => buildScopeQuery('bogus' as ScopeMode, 'whatever')).toThrow(/scopeMode/)
  })

  it('accepts a plus-tagged address without throwing', () => {
    expect(buildScopeQuery('address', 'board+arc@mp.org')).toBe(
      '(to:board+arc@mp.org OR cc:board+arc@mp.org OR deliveredto:board+arc@mp.org OR from:board+arc@mp.org)',
    )
  })

  it('accepts a subdomain address without throwing', () => {
    expect(buildScopeQuery('address', 'board@mail.mp.org')).toBe(
      '(to:board@mail.mp.org OR cc:board@mail.mp.org OR deliveredto:board@mail.mp.org OR from:board@mail.mp.org)',
    )
  })
})

describe('buildScopeQuery — sent mail (Phase B D1)', () => {
  it('matches mail the HOA sent, not only mail it received', () => {
    const q = buildScopeQuery('address', 'hoa@example.com')
    expect(q).toContain('from:hoa@example.com')
    expect(q).toContain('to:hoa@example.com')
  })

  it('still rejects a malformed scope value rather than widening the fetch', () => {
    expect(() => buildScopeQuery('address', 'not an email')).toThrow()
  })
})

describe('isInScope — sent mail', () => {
  const base = {
    toEmails: ['resident@example.com'],
    ccEmails: [],
    deliveredTo: [],
    fromEmail: 'hoa@example.com',
  }

  it('accepts a message the HOA sent', () => {
    expect(isInScope(base as never, 'address', 'hoa@example.com')).toBe(true)
  })

  it('accepts a message the HOA received', () => {
    const inbound = { ...base, toEmails: ['hoa@example.com'], fromEmail: 'r@example.com' }
    expect(isInScope(inbound as never, 'address', 'hoa@example.com')).toBe(true)
  })

  it('still rejects an unrelated message', () => {
    const other = { ...base, fromEmail: 'spam@example.com' }
    expect(isInScope(other as never, 'address', 'hoa@example.com')).toBe(false)
  })

  it('fails closed when scopeValue is missing', () => {
    expect(isInScope(base as never, 'address', null)).toBe(false)
  })
})

describe('recommendScope', () => {
  it('recommends a non-primary shared alias when one exists', () => {
    const result = recommendScope(
      [
        { sendAsEmail: 'president@gmail.com', isPrimary: true, isDefault: true },
        { sendAsEmail: 'board@mp.org', isPrimary: false, isDefault: false },
      ],
      'president@gmail.com',
    )
    expect(result).toEqual({ scopeMode: 'address', scopeValue: 'board@mp.org' })
  })

  it('recommends address-scoped on the primary when it is the only address', () => {
    const result = recommendScope(
      [{ sendAsEmail: 'board@mp.org', isPrimary: true, isDefault: true }],
      'board@mp.org',
    )
    // Still 'address', not 'all' — safe default even for a dedicated
    // account. The user can widen it explicitly.
    expect(result).toEqual({ scopeMode: 'address', scopeValue: 'board@mp.org' })
  })

  it('falls back to the profile email when sendAs is empty', () => {
    expect(recommendScope([], 'board@mp.org')).toEqual({
      scopeMode: 'address',
      scopeValue: 'board@mp.org',
    })
  })

  it('with multiple non-primary aliases, picks the first one in list order', () => {
    // Pinning this so the choice is documented behavior, not incidental —
    // Array.prototype.find takes the first match.
    const result = recommendScope(
      [
        { sendAsEmail: 'president@gmail.com', isPrimary: true, isDefault: true },
        { sendAsEmail: 'board@mp.org', isPrimary: false, isDefault: false },
        { sendAsEmail: 'arc@mp.org', isPrimary: false, isDefault: false },
      ],
      'president@gmail.com',
    )
    expect(result).toEqual({ scopeMode: 'address', scopeValue: 'board@mp.org' })
  })
})
