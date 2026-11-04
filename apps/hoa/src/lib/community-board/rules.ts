// Community board rules (B5). Pure and flag-free: the routes, the pages and
// the client components all import this, so it imports nothing.

export const BOARD_TITLE_MIN = 3
export const BOARD_TITLE_MAX = 120
export const BOARD_BODY_MAX = 4000
export const BOARD_REPORT_MAX = 500
export const BOARD_HIDE_REASON_MAX = 300
/** Threads and posts read per page. Lists paginate explicitly (RC-9). */
export const BOARD_PAGE_SIZE = 25
export const BOARD_POST_CAP = 200

export type BoardRole = 'admin' | 'board' | 'resident'

export interface BoardThreadState {
  closed_at: string | null
  hidden_at: string | null
}

export interface BoardPostState {
  hidden_at: string | null
  is_opening: boolean
}

export function isBoardModerator(role: BoardRole): boolean {
  return role === 'admin' || role === 'board'
}

/**
 * May this person use the board of `associationId`? A moderator uses every
 * association of their organization (the route has already proved the id is
 * theirs); a resident only the associations they live in.
 */
export function canUseAssociationBoard(
  role: BoardRole,
  associationId: string,
  residentAssociationIds: readonly string[],
): boolean {
  if (isBoardModerator(role)) return true
  return residentAssociationIds.includes(associationId)
}

export type ReplyRefusal = 'thread_closed' | 'thread_hidden'

/**
 * Why a reply is refused, or null when it may go ahead. A moderator may still
 * answer in a closed thread (to say why it was closed); a resident may not.
 */
export function replyRefusal(role: BoardRole, thread: BoardThreadState): ReplyRefusal | null {
  if (thread.hidden_at && !isBoardModerator(role)) return 'thread_hidden'
  if (thread.closed_at && !isBoardModerator(role)) return 'thread_closed'
  return null
}

/** A resident never sees a hidden post; a moderator sees all of them. */
export function postVisibleTo<T extends { hidden_at: string | null }>(role: BoardRole, post: T): boolean {
  return isBoardModerator(role) || post.hidden_at == null
}

export function threadVisibleTo(role: BoardRole, thread: BoardThreadState): boolean {
  return isBoardModerator(role) || thread.hidden_at == null
}

/**
 * A person's name as a neighbour sees it: first name and last initial.
 * Never an email, address or unit.
 */
export function authorLabel(fullName: string | null | undefined): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0 || (parts[0] ?? '').includes('@')) return 'A neighbor'
  const first = parts[0] as string
  const last = parts.length > 1 ? (parts[parts.length - 1] as string) : ''
  const initial = last ? ` ${last.charAt(0).toUpperCase()}.` : ''
  return `${first}${initial}`.slice(0, 80)
}

export type BoardAction = 'hide_post' | 'unhide_post' | 'close_thread' | 'reopen_thread' | 'dismiss_report' | 'resolve_report'

export const BOARD_ACTION_LABEL: Record<BoardAction, string> = {
  hide_post: 'Hide this post',
  unhide_post: 'Show this post again',
  close_thread: 'Close this thread',
  reopen_thread: 'Open this thread again',
  dismiss_report: 'Keep the post, dismiss the report',
  resolve_report: 'Hide the post and close the report',
}

/**
 * How many posts of a thread to show. A page shows BOARD_POST_CAP; each
 * "Show more replies" step adds another BOARD_POST_CAP, up to 2000 in all.
 */
export function postLimitFromParam(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(n) || n < BOARD_POST_CAP) return BOARD_POST_CAP
  return Math.min(2000, Math.ceil(n / BOARD_POST_CAP) * BOARD_POST_CAP)
}

/** Text a person typed: trimmed, with runs of blank lines collapsed. */
export function cleanBoardText(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}
