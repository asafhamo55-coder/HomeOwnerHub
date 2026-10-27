/**
 * BL-165: the voting board for a disclosure — org members with the board
 * role (admins are managers, not directors, so they are not asked). Reads
 * profiles with the service role through fetchBoardMembers, so callers
 * must have passed a board/admin role gate first.
 */

import { fetchBoardMembers } from '@/lib/communications/audience'
import type { BoardSeat } from './load'

export async function fetchVotingBoard(orgId: string): Promise<BoardSeat[]> {
  const members = await fetchBoardMembers(orgId, ['board'])
  return members.map((m) => ({ userId: m.userId, fullName: m.fullName || m.email || 'Board member' }))
}
