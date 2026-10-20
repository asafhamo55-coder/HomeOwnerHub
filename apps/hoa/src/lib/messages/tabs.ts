/**
 * The "Messages" area (BL-102 A11, docs/research/2026-10-messages-area.md).
 *
 * One sidebar item over two existing pages. No new routes: the tabs are
 * links to today's URLs, so bookmarks, emailed links and the command
 * palette keep working.
 *
 *   Inbox                     /inbox                         resident email (BL-101)
 *   Sent to residents         /communications                broadcasts, sent and scheduled
 *   Drafts                    /communications?status=draft   autosaved broadcast drafts (A9)
 *
 * "Replies to announcements" is a read-only filter inside the Inbox tab
 * (`/inbox?view=replies`), not a tab of its own.
 */

/** Every path that belongs to the Messages area. The sidebar item lights for all of them. */
export const MESSAGES_PREFIXES = ['/inbox', '/communications'] as const

export type MessagesTabKey = 'inbox' | 'sent' | 'drafts'

export interface MessagesTab {
  key: MessagesTabKey
  label: string
  href: string
}

export const MESSAGES_TABS: readonly MessagesTab[] = [
  { key: 'inbox', label: 'Inbox', href: '/inbox' },
  { key: 'sent', label: 'Sent to residents', href: '/communications' },
  { key: 'drafts', label: 'Drafts', href: '/communications?status=draft' },
]

/** The read-only "Replies to announcements" filter in the Inbox tab. */
export const ANNOUNCEMENT_REPLIES_HREF = '/inbox?view=replies'

export function announcementReplyHref(replyId: string, page = 1): string {
  const q = new URLSearchParams({ view: 'replies' })
  if (page > 1) q.set('page', String(page))
  q.set('reply', replyId)
  return `/inbox?${q.toString()}`
}

/** The two composers behind the one "New message" button. */
export const NEW_MESSAGE_CHOICES = [
  {
    key: 'one',
    label: 'To one resident',
    hint: 'An email from the HOA mailbox. Their reply comes back to the Inbox.',
    href: '/inbox/compose',
  },
  {
    key: 'many',
    label: 'To many homes',
    hint: 'An announcement by email, text or the portal, with results per home.',
    href: '/communications/new',
  },
] as const

/**
 * Who sees the Inbox tab. This is NOT a second rule: it mirrors
 * `requireBoardOrAdmin` in inbox/page.tsx (and the inbox tables' RLS,
 * auth_is_board_or_admin) exactly. Mailbox *management* stays admin-only
 * and is decided on the inbox page itself, unchanged.
 */
export function canSeeInboxTab(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'board'
}

/** Which tab a Messages page is showing. `status` is the /communications status filter. */
export function activeMessagesTab(pathname: string, status?: string | null): MessagesTabKey | null {
  if (pathname === '/inbox' || pathname.startsWith('/inbox/')) return 'inbox'
  if (pathname === '/communications' || pathname.startsWith('/communications/')) {
    return status === 'draft' ? 'drafts' : 'sent'
  }
  return null
}

/** True when `pathname` is anywhere in the Messages area. */
export function isMessagesPath(pathname: string): boolean {
  return MESSAGES_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** The tabs a role sees, with the active one marked. */
export function messagesTabsFor(
  active: MessagesTabKey | null,
  opts: { showInbox: boolean },
): Array<MessagesTab & { active: boolean }> {
  return MESSAGES_TABS.filter((t) => t.key !== 'inbox' || opts.showInbox).map((t) => ({
    ...t,
    active: t.key === active,
  }))
}
