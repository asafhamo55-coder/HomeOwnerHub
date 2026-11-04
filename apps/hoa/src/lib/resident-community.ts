// What the resident "Community" page lists. Pure: the flags are passed in so
// the page, the home tile and the tests all agree on one rule. A feature
// shows only when its switch is on.

export interface CommunityLink {
  key: 'polls' | 'amenities' | 'board'
  href: string
  title: string
  hint: string
}

export function communityLinks(flags: { polls: boolean; amenities: boolean; board: boolean }): CommunityLink[] {
  const out: CommunityLink[] = []
  if (flags.polls) out.push({ key: 'polls', href: '/resident/polls', title: 'Polls', hint: 'Answer quick questions from your board' })
  if (flags.amenities)
    out.push({ key: 'amenities', href: '/resident/amenities', title: 'Book a space', hint: 'Clubhouse, pool, courts' })
  if (flags.board) out.push({ key: 'board', href: '/resident/board', title: 'Talk with neighbors', hint: 'Start a topic or reply' })
  return out
}
