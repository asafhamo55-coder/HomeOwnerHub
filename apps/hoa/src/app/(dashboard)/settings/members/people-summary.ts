import type { SummaryTile } from '@/components/SummaryStrip'

/**
 * Tiles for the People page strip. Pure: the page passes counts it already
 * has. A null count means that read failed, and the tile says "Not available"
 * rather than 0.
 */
export interface PeopleCounts {
  /** Members whose role is board, or null when the member list failed. */
  boardMembers: number | null
  /** Members with the resident role: owners who already have an account. */
  ownersWithAccount: number | null
  /** Owners on the roster with an email and no account yet. */
  ownersNotInvited: number | null
  /** Invitations sent and not accepted yet. */
  invitesPending: number | null
}

const n = (v: number | null) => (v === null ? null : String(v))

export function peopleSummaryTiles(c: PeopleCounts): SummaryTile[] {
  return [
    {
      label: 'Board members',
      value: n(c.boardMembers),
      hint: 'People who run the association',
      href: '#members',
    },
    {
      label: 'Owners with an account',
      value: n(c.ownersWithAccount),
      hint: 'Signed up for the portal',
      href: '#members',
    },
    {
      label: 'Owners not invited yet',
      value: n(c.ownersNotInvited),
      hint: 'On your roster with an email, no account',
      href: '#invite-owners',
      tone: c.ownersNotInvited ? 'warning' : 'default',
    },
    {
      label: 'Invites pending',
      value: n(c.invitesPending),
      hint: 'Sent and not accepted yet',
      href: '#pending-invitations',
    },
  ]
}
