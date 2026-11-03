import { describe, expect, it } from 'vitest'
import { inResidentAssociations, ownAssociationIds } from './resident-association-scope'

describe('resident association scope', () => {
  it('collects distinct association ids and skips units without one', () => {
    expect(
      ownAssociationIds([{ association_id: 'a' }, { association_id: 'a' }, { association_id: null }, { association_id: 'b' }]),
    ).toEqual(['a', 'b'])
  })
  it('keeps org-wide rows and own rows, drops other associations', () => {
    expect(inResidentAssociations(null, ['a'])).toBe(true)
    expect(inResidentAssociations('a', ['a'])).toBe(true)
    expect(inResidentAssociations('b', ['a'])).toBe(false)
    expect(inResidentAssociations('b', [])).toBe(false)
  })
})
