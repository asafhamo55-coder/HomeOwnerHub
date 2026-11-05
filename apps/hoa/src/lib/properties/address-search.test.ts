import { describe, expect, it } from 'vitest'
import { addressOrFilter } from './address-search'

describe('addressOrFilter', () => {
  it('searches what was typed and its standard form', () => {
    expect(addressOrFilter('address', 'main street')).toBe('address.ilike.%main street%,address.ilike.%Main St%')
    expect(addressOrFilter('address_line1', '12 oak avenue northeast')).toBe(
      'address_line1.ilike.%12 oak avenue northeast%,address_line1.ilike.%12 Oak Ave NE%',
    )
  })

  it('skips the second pattern when it is identical', () => {
    expect(addressOrFilter('address', '12 Oak St')).toBe('address.ilike.%12 Oak St%')
    expect(addressOrFilter('address', 'peachtree')).toBe('address.ilike.%peachtree%,address.ilike.%Peachtree%')
  })

  it('escapes LIKE wildcards in both patterns', () => {
    const f = addressOrFilter('address', '50%_off street') as string
    expect(f).toContain('%50\\%\\_off street%')
    expect(f).not.toContain('%50%_')
  })

  it('cannot change the shape of the or() filter', () => {
    const f = addressOrFilter('address', 'a),id.neq.0,(b*"c') as string
    expect(f.split(',')).toHaveLength(f.split('address.ilike.').length - 1)
    expect(f).not.toMatch(/[()*"]/)
    // Every condition is an ilike on the address column; the injected text is only pattern text.
    expect(f.split(',').every((c) => c.startsWith('address.ilike.%'))).toBe(true)
  })

  it('is null when nothing is left to search', () => {
    expect(addressOrFilter('address', '  ,() ')).toBeNull()
    expect(addressOrFilter('address', '')).toBeNull()
  })
})
