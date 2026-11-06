import { describe, expect, it } from 'vitest'
import { readCommunityLocation, saveCommunityLocationSchema, withCommunityLocation } from './association-location'

const A = '11111111-1111-4111-8111-111111111111'

describe('community location', () => {
  it('accepts a city and ZIP, trimmed', () => {
    const p = saveCommunityLocationSchema.parse({ associationId: A, city: '  Atlanta ', zip: ' 30067 ' })
    expect(p).toMatchObject({ city: 'Atlanta', zip: '30067' })
  })
  it('accepts ZIP+4 and empty values (clearing)', () => {
    expect(saveCommunityLocationSchema.safeParse({ associationId: A, city: '', zip: '30067-1234' }).success).toBe(true)
    expect(saveCommunityLocationSchema.safeParse({ associationId: A }).success).toBe(true)
  })
  it('accepts real city names', () => {
    for (const city of ['Johns Creek', 'St. Marys', "O'Fallon", 'Winston-Salem']) {
      expect(saveCommunityLocationSchema.safeParse({ associationId: A, city }).success, city).toBe(true)
    }
  })
  it('rejects a bad ZIP and a city with digits or markup', () => {
    expect(saveCommunityLocationSchema.safeParse({ associationId: A, zip: '3006' }).success).toBe(false)
    expect(saveCommunityLocationSchema.safeParse({ associationId: A, city: 'At<b>lanta' }).success).toBe(false)
    expect(saveCommunityLocationSchema.safeParse({ associationId: A, city: 'x'.repeat(81) }).success).toBe(false)
  })
  it('reads tolerantly and keeps other keys on write', () => {
    expect(readCommunityLocation(null)).toEqual({ city: '', zip: '' })
    expect(readCommunityLocation({ community_city: 5, community_zip: 'bad' })).toEqual({ city: '', zip: '' })
    const w = withCommunityLocation({ board_contacts: [1] }, { city: 'Atlanta', zip: '30067' })
    expect(w).toEqual({ board_contacts: [1], community_city: 'Atlanta', community_zip: '30067' })
    expect(readCommunityLocation(w)).toEqual({ city: 'Atlanta', zip: '30067' })
  })
})
