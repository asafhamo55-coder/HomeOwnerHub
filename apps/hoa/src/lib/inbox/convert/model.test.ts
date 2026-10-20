import { describe, it, expect } from 'vitest'
import {
  VIOLATION_NOTES_MAX,
  TICKET_DESCRIPTION_MAX,
  arcPrefillFromEmail,
  boardArcHref,
  cleanSubject,
  contactPrefillFromEmail,
  guessTicketCategory,
  isReservedTicketSubject,
  ownWords,
  pickLinkCandidates,
  ticketPrefillFromEmail,
  violationNotesFromEmail,
} from './model'
import { CONTACT_ACK, TICKET_CATEGORIES, VIOLATION_ACK, arcAck, ticketAck } from './ack'
import { CONTACT_SUBJECT } from '@/lib/contact-updates/model'

// BL-101 A4 — the pure half of "Create from this email". Synthetic text,
// names, addresses and numbers only.

const QUOTED = [
  'The streetlight by the mailboxes has been out for a week.',
  '',
  'On Mon, Oct 19, 2026 at 9:00 AM Board <board@example.org> wrote:',
  '> Thanks for writing in.',
].join('\n')

describe('ownWords', () => {
  it('cuts at an "On … wrote:" line', () => {
    expect(ownWords(QUOTED).trim()).toBe('The streetlight by the mailboxes has been out for a week.')
  })

  it('cuts at the first quoted line and at an "Original Message" divider', () => {
    expect(ownWords('Hello\n> old').trim()).toBe('Hello')
    expect(ownWords('Hello\n-----Original Message-----\nold').trim()).toBe('Hello')
  })

  it('is empty for null', () => {
    expect(ownWords(null)).toBe('')
  })
})

describe('violationNotesFromEmail', () => {
  it('redacts contact details (the wizard sends notes to AI)', () => {
    const notes = violationNotesFromEmail('Trailer parked at 12 Example Ct again. Call me at 555-201-3344 or pat@example.com')
    expect(notes).not.toContain('555-201-3344')
    expect(notes).not.toContain('pat@example.com')
    expect(notes).not.toContain('12 Example Ct')
    expect(notes).toContain('Trailer parked')
  })

  it('caps the notes', () => {
    const notes = violationNotesFromEmail('word '.repeat(2000))
    expect(notes.length).toBeLessThanOrEqual(VIOLATION_NOTES_MAX)
    expect(notes.endsWith('…')).toBe(true)
  })
})

describe('contactPrefillFromEmail', () => {
  it('reads a phone, a new email and a mailing address from the resident’s own words', () => {
    const p = contactPrefillFromEmail(
      'Please update my details.\nMy new number is (555) 201-3344.\nUse new.me@example.com from now on.\nMailing address: 9 Sample Rd, Springfield, IL 62701\n> old quoted 555-999-0000',
      'old.me@example.com',
    )
    expect(p.phone).toMatch(/555/)
    expect(p.phone).toMatch(/3344/)
    expect(p.email).toBe('new.me@example.com')
    expect(p.mailing).toContain('9 Sample Rd')
  })

  it('never offers the address they wrote from', () => {
    expect(contactPrefillFromEmail('Reach me at Old.Me@example.com', 'old.me@example.com').email).toBe('')
  })

  it('is all blanks for an email that asks for nothing', () => {
    expect(contactPrefillFromEmail('When does the pool open?', 'a@example.com')).toEqual({ phone: '', email: '', mailing: '' })
  })
})

describe('pickLinkCandidates', () => {
  it('drops what is linked already and sorts newest first', () => {
    const rows = [
      { type: 'ticket' as const, id: 't1', label: 'a', status: 'open', date: '2026-01-01' },
      { type: 'violation' as const, id: 'v1', label: 'b', status: 'open', date: '2026-03-01' },
      { type: 'arc_request' as const, id: 'a1', label: 'c', status: 'pending', date: null },
    ]
    const out = pickLinkCandidates(rows, [{ type: 'ticket', id: 't1' }])
    expect(out.map((r) => r.id)).toEqual(['v1', 'a1'])
  })

  it('matches on type AND id (same uuid under another type is still offered)', () => {
    const rows = [{ type: 'violation' as const, id: 'x', label: 'b', status: 'open', date: null }]
    expect(pickLinkCandidates(rows, [{ type: 'ticket', id: 'x' }])).toHaveLength(1)
  })
})

describe('cleanSubject', () => {
  it('strips stacked reply and forward prefixes', () => {
    expect(cleanSubject('Re: FW: Fwd:  Pool gate   latch')).toBe('Pool gate latch')
    expect(cleanSubject('RE[2]: Gate')).toBe('Gate')
  })

  it('keeps a subject that merely starts with those letters', () => {
    expect(cleanSubject('Repair request')).toBe('Repair request')
    expect(cleanSubject(null)).toBe('')
  })
})

describe('guessTicketCategory', () => {
  it.each([
    ['Gas smell by the pool', '', 'safety'],
    ['Question about my dues', '', 'billing'],
    ['Gate remote stopped working', '', 'access'],
    ['Boat on the street', '', 'parking'],
    ['Loud music every night', '', 'noise'],
    ['Streetlight out', '', 'common_area'],
    ['Sprinkler is broken', '', 'maintenance'],
    ['Hello', 'Just saying hi', 'general'],
  ] as const)('%s → %s', (subject, text, want) => {
    expect(guessTicketCategory(subject, text)).toBe(want)
  })

  it('ignores the quoted thread', () => {
    expect(guessTicketCategory('Hello', 'Thanks!\n> your dues are late')).toBe('general')
  })

  it('always returns a category the tickets CHECK accepts', () => {
    expect(TICKET_CATEGORIES).toContain(guessTicketCategory('anything', 'at all'))
  })
})

describe('ticketPrefillFromEmail', () => {
  it('prefills subject, own words and a guessed category', () => {
    const p = ticketPrefillFromEmail('Re: Streetlight out by the mailboxes', QUOTED)
    expect(p).toEqual({
      category: 'common_area',
      subject: 'Streetlight out by the mailboxes',
      description: 'The streetlight by the mailboxes has been out for a week.',
    })
  })

  it('replaces a too-short subject and the contact-update subject Approvals parses', () => {
    expect(ticketPrefillFromEmail('Re: Hi', 'x').subject).toBe('Emailed request')
    expect(ticketPrefillFromEmail(CONTACT_SUBJECT, 'x').subject).toBe('Emailed request')
    expect(isReservedTicketSubject(`  ${CONTACT_SUBJECT.toUpperCase()} `)).toBe(true)
  })

  it('caps the description', () => {
    expect(ticketPrefillFromEmail('Long one', 'a'.repeat(9000)).description.length).toBeLessThanOrEqual(TICKET_DESCRIPTION_MAX)
  })
})

describe('arcPrefillFromEmail / boardArcHref', () => {
  it('builds the resident’s ARC form link from a fixed template, labelled as the board’s', () => {
    const p = arcPrefillFromEmail('Re: New fence', 'Can I put up a 6 ft cedar fence? Call 555-201-3344.\n> quoted')
    expect(p.summary).toBe('Exterior change: New fence')
    expect(p.scope).toContain('From my email to the board:')
    expect(p.scope).toContain('6 ft cedar fence')
    expect(p.scope).not.toContain('555-201-3344')
    expect(p.scope).not.toContain('quoted')

    const href = boardArcHref(p)
    const url = new URL(href, 'https://app.example.test')
    expect(url.pathname).toBe('/resident/arc/new')
    expect(url.searchParams.get('summary')).toBe(p.summary)
    expect(url.searchParams.get('scope')).toBe(p.scope)
    expect(url.searchParams.get('from')).toBe('board')
  })

  it('strips links and markup out of the subject', () => {
    const p = arcPrefillFromEmail('Fence <b>see</b> https://evil.example/x', '')
    expect(p.summary).not.toMatch(/https?:|evil\.example|<|>/)
    expect(p.scope).toBe('Describe the change, materials and colors:')
  })

  it('falls back to a generic summary without a subject', () => {
    expect(arcPrefillFromEmail('', 'x').summary).toBe('Exterior change to my home')
  })

  it('keeps the link short enough for an email', () => {
    const href = boardArcHref(arcPrefillFromEmail('Fence', 'word '.repeat(1000)))
    expect(href.length).toBeLessThan(3000)
  })
})

describe('acknowledgement lines (fixed templates)', () => {
  it('never promise the resident can see the record in the portal', () => {
    for (const line of [...TICKET_CATEGORIES.map(ticketAck), VIOLATION_ACK, CONTACT_ACK]) {
      expect(line).not.toMatch(/portal|track|log in|sign in/i)
    }
  })

  it('names the category only when it is a real one', () => {
    expect(ticketAck('parking')).toContain('as a parking request')
    expect(ticketAck('general')).toContain('as a request')
  })

  it('carries the ARC link', () => {
    expect(arcAck('https://app.example.test/resident/arc/new?x=1')).toContain('https://app.example.test/resident/arc/new?x=1')
  })
})
