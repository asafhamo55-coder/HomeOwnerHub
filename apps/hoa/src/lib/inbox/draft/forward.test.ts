import { describe, it, expect } from 'vitest'
import { buildForwardSubject, buildForwardBody } from './forward'
import type { ThreadMessage } from '@/lib/inbox/queries'

function message(overrides: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id: 'm1',
    direction: 'inbound',
    fromName: 'Jane Doe',
    fromEmail: 'jane@example.com',
    toEmails: ['hoa@example.com'],
    subject: 'Fence repair',
    bodyText: 'The fence is broken.',
    strippedText: 'The fence is broken.',
    sentAt: '2026-07-30T16:14:00.000Z',
    attachments: [],
    forwardedTo: null,
    ...overrides,
  }
}

describe('buildForwardSubject', () => {
  it('prefixes with Fwd:', () => {
    expect(buildForwardSubject('Fence repair')).toBe('Fwd: Fence repair')
  })

  it('does not double-prefix an already-forwarded subject', () => {
    expect(buildForwardSubject('Fwd: Fence repair')).toBe('Fwd: Fence repair')
    expect(buildForwardSubject('FWD: Fence repair')).toBe('FWD: Fence repair')
  })

  it('handles a missing subject', () => {
    expect(buildForwardSubject(null)).toBe('Fwd: (no subject)')
  })
})

describe('buildForwardBody', () => {
  it('opens with a blank line for the sender to write in', () => {
    expect(buildForwardBody([message()]).startsWith('\n\n')).toBe(true)
  })

  it('uses the marker stripQuotedReply recognises', () => {
    expect(buildForwardBody([message()])).toContain('---------- Forwarded message ----------')
  })

  it('carries the original headers and body', () => {
    const out = buildForwardBody([message()])
    expect(out).toContain('From: Jane Doe <jane@example.com>')
    expect(out).toContain('Subject: Fence repair')
    expect(out).toContain('To: hoa@example.com')
    expect(out).toContain('The fence is broken.')
  })

  it('quotes the FULL body, not the stripped one — a forward carries history', () => {
    const out = buildForwardBody([
      message({ bodyText: 'New\n\nOn Mon, X wrote:\n> old', strippedText: 'New' }),
    ])
    expect(out).toContain('> old')
  })

  it('forwards the most recent message when a thread has several', () => {
    const out = buildForwardBody([
      message({ id: 'm1', bodyText: 'first', sentAt: '2026-07-30T10:00:00.000Z' }),
      message({ id: 'm2', bodyText: 'second', sentAt: '2026-07-31T10:00:00.000Z' }),
    ])
    expect(out).toContain('second')
    expect(out).not.toContain('first')
  })

  it('falls back gracefully when a message has no body or sender', () => {
    const out = buildForwardBody([message({ bodyText: null, strippedText: null, fromEmail: null, fromName: null })])
    expect(out).toContain('(no body)')
    expect(out).toContain('From: Unknown')
  })

  it('returns just the blank opening when there are no messages', () => {
    expect(buildForwardBody([])).toBe('\n\n')
  })
})
