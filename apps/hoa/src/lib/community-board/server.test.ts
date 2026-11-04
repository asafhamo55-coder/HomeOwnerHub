import { describe, expect, it } from 'vitest'
import { requireAssociationAccess, requireModerator, type BoardActor } from './server'

// Posts are scoped to one association. A resident of another community gets
// the same "not found" a missing row gets, so ids cannot be probed.

const resident: BoardActor = { orgId: 'o', userId: 'u', role: 'resident', residentAssociationIds: ['a1'] }
const board: BoardActor = { orgId: 'o', userId: 'b', role: 'board', residentAssociationIds: [] }

describe('community board scoping', () => {
  it('lets a resident use only the association they live in', () => {
    expect(() => requireAssociationAccess(resident, 'a1')).not.toThrow()
    expect(() => requireAssociationAccess(resident, 'a2')).toThrowError(/not.?found/i)
  })

  it('lets the board use every association of its organization', () => {
    expect(() => requireAssociationAccess(board, 'a2')).not.toThrow()
  })

  it('keeps moderation to board and admin', () => {
    expect(() => requireModerator(board)).not.toThrow()
    expect(() => requireModerator(resident)).toThrow()
  })
})
