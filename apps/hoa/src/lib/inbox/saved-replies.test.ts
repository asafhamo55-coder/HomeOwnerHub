import { describe, expect, it } from 'vitest'
import { hasUnfilledBlanks } from './draft/blanks'
import { SAVED_REPLIES, fieldsUsed, findSavedReply, firstNameFrom, formatBalance, renderSavedReply, type MergeValues } from './saved-replies'

// Synthetic values only.
const values: MergeValues = {
  firstName: 'Pat',
  balance: formatBalance(41250, '2026-10-20'),
  portalLink: 'https://app.example.test/resident',
  arcLink: 'https://app.example.test/resident/arc/new',
}

describe('the starter library', () => {
  it('has unique ids and only known merge fields', () => {
    expect(new Set(SAVED_REPLIES.map((r) => r.id)).size).toBe(SAVED_REPLIES.length)
    for (const r of SAVED_REPLIES) {
      for (const f of fieldsUsed(r.text)) expect(['first_name', 'balance', 'portal_link', 'arc_link']).toContain(f)
    }
  })

  it('is paragraphs, not whole emails: no greeting or sign-off', () => {
    for (const r of SAVED_REPLIES) {
      expect(r.text).not.toMatch(/^(hi|hello|dear)\b/i)
      expect(r.text).not.toMatch(/(regards|sincerely|best),?\s*$/i)
    }
  })

  it('states no statute, deadline in days, or dollar figure of its own', () => {
    for (const r of SAVED_REPLIES) {
      expect(r.text).not.toMatch(/§|\bstatute\b|\b\d+\s*(business\s*)?days?\b|\$\d/i)
    }
  })

  it('every community-specific detail is a blank, so Approve stays blocked until filled', () => {
    for (const id of ['pool-hours', 'gate-fob', 'trash-day', 'records-request', 'resale-estoppel', 'how-to-pay']) {
      expect(hasUnfilledBlanks(renderSavedReply(findSavedReply(id)!.text, values))).toBe(true)
    }
    // A reply with no facts and every field resolved is sendable as is.
    expect(hasUnfilledBlanks(renderSavedReply(findSavedReply('portal-sign-in')!.text, values))).toBe(false)
  })
})

describe('renderSavedReply', () => {
  it('fills the fields', () => {
    const out = renderSavedReply('Hi {{first_name}}: {{balance}} — {{portal_link}} / {{ arc_link }}', values)
    expect(out).toBe('Hi Pat: $412.50 (as of 2026-10-20) — https://app.example.test/resident / https://app.example.test/resident/arc/new')
  })

  it('a withheld balance is a money blank (Approve blocked), never empty or zero', () => {
    const out = renderSavedReply('Balance: {{balance}}', { ...values, balance: null })
    expect(out).toBe('Balance: [[BLANK: money]]')
    expect(hasUnfilledBlanks(out)).toBe(true)
  })

  it('a missing first name reads as a greeting, and an unknown field is a blank', () => {
    expect(renderSavedReply('Hi {{first_name}}, {{mystery}}', { ...values, firstName: null })).toBe('Hi there, [[BLANK: other]]')
  })
})

describe('firstNameFrom', () => {
  it('takes the first word of a real-looking name', () => {
    expect(firstNameFrom('pat example')).toBe('Pat')
    expect(firstNameFrom('"Sam O’Neil"')).toBe('Sam')
    expect(firstNameFrom('Example, Pat')).toBe('Example')
  })

  it('refuses addresses, role names, digits and empties', () => {
    for (const v of ['pat@example.test', 'Accounts Payable', 'Office', 'R2D2', '', null, undefined, 'x'.repeat(40)]) {
      expect(firstNameFrom(v)).toBeNull()
    }
  })
})
