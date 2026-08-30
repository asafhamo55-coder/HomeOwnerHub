import { describe, it, expect } from 'vitest'
import { buildSenderName, formatFrom } from './sender-name'

/**
 * Every tenant's mail used to go out as "HomeownerHub" because EMAIL_FROM is
 * a single global env var and sendEmail took no tenant context. These two
 * pure functions are the whole of the fix; the call sites just pass a name.
 */
describe('buildSenderName', () => {
  it('appends HOA to a bare community name', () => {
    expect(buildSenderName('Madison Park', 'hoa')).toBe('Madison Park HOA')
  })

  // The case that rules out a blind append: this name already says what it
  // is, and "Creek Valley Community Association HOA" reads like a bug.
  it('leaves a name that already ends in a community word alone', () => {
    expect(buildSenderName('Creek Valley Community Association', 'hoa')).toBe(
      'Creek Valley Community Association',
    )
  })

  it.each([
    ['Oakwood HOA', 'hoa'],
    ['Oakwood Condominium', 'condo'],
    ['Oakwood Cooperative', 'coop'],
    ['Oakwood Community', 'hoa'],
    ['Oakwood Condo', 'condo'],
    ['Oakwood Co-op', 'coop'],
  ] as const)('does not double-suffix %s', (name, type) => {
    expect(buildSenderName(name, type)).toBe(name)
  })

  it('matches the community word case-insensitively', () => {
    expect(buildSenderName('Oakwood hoa', 'hoa')).toBe('Oakwood hoa')
  })

  // "Hoagie Lane" contains the letters h-o-a but is not an HOA.
  it('only matches whole words, not substrings', () => {
    expect(buildSenderName('Hoagie Lane', 'hoa')).toBe('Hoagie Lane HOA')
  })

  it('uses the right suffix per association type', () => {
    expect(buildSenderName('Madison Park', 'condo')).toBe('Madison Park Condominium Association')
    expect(buildSenderName('Madison Park', 'coop')).toBe('Madison Park Housing Cooperative')
  })

  // Better a bare name than an invented label.
  it('adds no suffix for an unrecognized or missing type', () => {
    expect(buildSenderName('Madison Park', 'townhome')).toBe('Madison Park')
    expect(buildSenderName('Madison Park', null)).toBe('Madison Park')
    expect(buildSenderName('Madison Park', undefined)).toBe('Madison Park')
  })

  it('trims surrounding whitespace', () => {
    expect(buildSenderName('  Madison Park  ', 'hoa')).toBe('Madison Park HOA')
  })

  it('returns empty string for a blank name so callers can fall back', () => {
    expect(buildSenderName('', 'hoa')).toBe('')
    expect(buildSenderName('   ', 'hoa')).toBe('')
  })
})

describe('formatFrom', () => {
  const ENV = 'HomeownerHub <noreply@homeownerledger.com>'

  it('swaps the display name and keeps the verified address', () => {
    expect(formatFrom(ENV, 'Madison Park HOA')).toBe(
      '"Madison Park HOA" <noreply@homeownerledger.com>',
    )
  })

  // Callers that pass nothing must be byte-for-byte unchanged — that is what
  // keeps platform/staff mail saying HomeownerHub.
  it('returns EMAIL_FROM untouched when no sender name is given', () => {
    expect(formatFrom(ENV)).toBe(ENV)
    expect(formatFrom(ENV, null)).toBe(ENV)
    expect(formatFrom(ENV, '')).toBe(ENV)
    expect(formatFrom(ENV, '   ')).toBe(ENV)
  })

  it('handles an EMAIL_FROM that is a bare address with no display name', () => {
    expect(formatFrom('noreply@homeownerledger.com', 'Madison Park HOA')).toBe(
      '"Madison Park HOA" <noreply@homeownerledger.com>',
    )
  })

  // Parentheses start a comment in an unquoted RFC 5322 display name, and a
  // real org here is literally named "Creek Valley HOA (Demo)".
  it('quotes a name containing RFC 5322 specials', () => {
    expect(formatFrom(ENV, 'Creek Valley HOA (Demo)')).toBe(
      '"Creek Valley HOA (Demo)" <noreply@homeownerledger.com>',
    )
    expect(formatFrom(ENV, 'Smith, Jones & Co')).toBe(
      '"Smith, Jones & Co" <noreply@homeownerledger.com>',
    )
  })

  it('escapes quotes and backslashes so the header cannot be broken out of', () => {
    expect(formatFrom(ENV, 'The "Big" Park')).toBe(
      '"The \\"Big\\" Park" <noreply@homeownerledger.com>',
    )
    expect(formatFrom(ENV, 'A\\B')).toBe('"A\\\\B" <noreply@homeownerledger.com>')
  })

  // A newline in a display name is header injection; strip rather than send.
  it('strips CR/LF from the display name', () => {
    expect(formatFrom(ENV, 'Evil\r\nBcc: attacker@example.com')).toBe(
      '"Evil Bcc: attacker@example.com" <noreply@homeownerledger.com>',
    )
  })

  it('falls back to EMAIL_FROM unchanged when no address can be parsed', () => {
    expect(formatFrom('not-an-address', 'Madison Park HOA')).toBe('not-an-address')
  })
})
