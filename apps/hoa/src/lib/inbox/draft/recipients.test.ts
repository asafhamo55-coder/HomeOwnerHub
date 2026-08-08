import { describe, it, expect } from 'vitest'
import { normalizeRecipients, isValidEmail, MAX_RECIPIENTS } from './recipients'

describe('isValidEmail', () => {
  it.each(['a@b.co', 'first.last+tag@sub.example.com'])('accepts %s', (v) => {
    expect(isValidEmail(v)).toBe(true)
  })

  it.each([
    'no-at-sign',
    'no@tld',
    'spa ce@example.com',
    'two@@example.com',
    'a@example.com, b@example.com',
    'a@example.com\r\nBcc: attacker@evil.com',
    '<a@example.com>',
    '',
  ])('rejects %j', (v) => {
    expect(isValidEmail(v)).toBe(false)
  })
})

describe('normalizeRecipients', () => {
  it('trims and lowercases, preserving order', () => {
    const result = normalizeRecipients(['  Resident@Example.COM '], [])
    expect(result).toEqual({ ok: true, to: ['resident@example.com'], cc: [] })
  })

  it('refuses an empty To — a message with no recipient cannot be sent', () => {
    const result = normalizeRecipients([], ['cc@example.com'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/at least one recipient/i)
  })

  it('refuses a To that is only whitespace', () => {
    expect(normalizeRecipients(['  '], []).ok).toBe(false)
  })

  it('names the offending address when one is malformed', () => {
    const result = normalizeRecipients(['ok@example.com', 'nope'], [])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('nope')
  })

  it('rejects a CR/LF injection attempt in a recipient', () => {
    expect(normalizeRecipients(['a@b.co\r\nBcc: attacker@evil.com'], []).ok).toBe(false)
  })

  it('deduplicates case-insensitively within To', () => {
    const result = normalizeRecipients(['a@b.co', 'A@B.CO'], [])
    expect(result).toEqual({ ok: true, to: ['a@b.co'], cc: [] })
  })

  it('drops a Cc address already present in To — Gmail would deliver twice', () => {
    const result = normalizeRecipients(['a@b.co'], ['A@B.co', 'c@d.co'])
    expect(result).toEqual({ ok: true, to: ['a@b.co'], cc: ['c@d.co'] })
  })

  it(`refuses more than ${MAX_RECIPIENTS} recipients across To and Cc`, () => {
    const many = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `u${i}@example.com`)
    const result = normalizeRecipients(many, [])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain(String(MAX_RECIPIENTS))
  })

  it(`allows exactly ${MAX_RECIPIENTS}`, () => {
    const many = Array.from({ length: MAX_RECIPIENTS }, (_, i) => `u${i}@example.com`)
    expect(normalizeRecipients(many, []).ok).toBe(true)
  })
})
