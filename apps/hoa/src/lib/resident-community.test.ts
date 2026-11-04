import { describe, expect, it } from 'vitest'
import { communityLinks } from './resident-community'

describe('resident community page', () => {
  it('lists only the features that are on, in plain words', () => {
    expect(communityLinks({ polls: true, amenities: true, board: true }).map((l) => l.title)).toEqual([
      'Polls',
      'Book a space',
      'Talk with neighbors',
    ])
    expect(communityLinks({ polls: false, amenities: true, board: false }).map((l) => l.href)).toEqual(['/resident/amenities'])
    expect(communityLinks({ polls: false, amenities: false, board: false })).toEqual([])
  })
})
