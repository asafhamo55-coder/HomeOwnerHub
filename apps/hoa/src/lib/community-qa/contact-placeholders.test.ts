import { describe, expect, it } from 'vitest'
import { ContactVault, fillContactPlaceholders } from './contact-placeholders'

describe('ContactVault', () => {
  it('hands out stable numbered tokens and reuses one per value', () => {
    const v = new ContactVault()
    expect(v.token('email', 'pat@example.com')).toBe('[OWNER_EMAIL_1]')
    expect(v.token('phone', '555-0100')).toBe('[OWNER_PHONE_1]')
    expect(v.token('email', 'sam@example.com')).toBe('[OWNER_EMAIL_2]')
    expect(v.token('email', 'pat@example.com')).toBe('[OWNER_EMAIL_1]')
    expect(v.size).toBe(3)
  })

  it('serialises to nothing, so it cannot ride along in a JSON body', () => {
    const v = new ContactVault()
    v.token('email', 'pat@example.com')
    expect(JSON.stringify({ v })).toBe('{"v":{}}')
  })
})

describe('fillContactPlaceholders', () => {
  const vault = new ContactVault()
  vault.token('email', 'pat@example.com')
  vault.token('phone', '555-0100')

  it('substitutes known tokens when a vault is given', () => {
    expect(fillContactPlaceholders('Reach Pat at [OWNER_EMAIL_1] or [OWNER_PHONE_1].', vault)).toBe(
      'Reach Pat at pat@example.com or 555-0100.',
    )
  })

  it('neutralises a token the vault does not hold (a model guess)', () => {
    expect(fillContactPlaceholders('Try [OWNER_EMAIL_7].', vault)).toBe('Try (not on file).')
  })

  it('withholds every token when no vault is given (caller may not see contact)', () => {
    expect(fillContactPlaceholders('Reach Pat at [OWNER_EMAIL_1].', null)).toBe('Reach Pat at (not shown).')
  })

  it('leaves text without tokens alone', () => {
    expect(fillContactPlaceholders('Twelve units are leased.', vault)).toBe('Twelve units are leased.')
  })
})
