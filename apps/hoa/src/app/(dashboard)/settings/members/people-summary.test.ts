import { describe, expect, it } from 'vitest'
import { peopleSummaryTiles } from './people-summary'

describe('peopleSummaryTiles', () => {
  it('shows the counts and links each tile to a section', () => {
    const t = peopleSummaryTiles({ boardMembers: 3, ownersWithAccount: 40, ownersNotInvited: 12, invitesPending: 5 })
    expect(t.map((x) => [x.label, x.value, x.href])).toEqual([
      ['Board members', '3', '#members'],
      ['Owners with an account', '40', '#members'],
      ['Owners not invited yet', '12', '#invite-owners'],
      ['Invites pending', '5', '#pending-invitations'],
    ])
  })
  it('keeps zero as 0 and a failed count as null', () => {
    const t = peopleSummaryTiles({ boardMembers: null, ownersWithAccount: null, ownersNotInvited: 0, invitesPending: null })
    expect(t[0]!.value).toBeNull()
    expect(t[1]!.value).toBeNull()
    expect(t[2]!.value).toBe('0')
    expect(t[2]!.tone).toBe('default')
    expect(t[3]!.value).toBeNull()
  })
})
