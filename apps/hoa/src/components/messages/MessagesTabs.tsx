import Link from 'next/link'
import { Tabs } from '@homeowner-portal/ui'
import { messagesTabsFor, type MessagesTabKey } from '@/lib/messages/tabs'

/**
 * The tab bar shared by the two Messages pages (BL-102 A11): Inbox, Sent to
 * residents, Drafts. Server component, links only — each tab is today's
 * URL, so nothing about routing changes.
 *
 * `showInbox` comes from `canSeeInboxTab(role)`, which mirrors the inbox
 * page's own `requireBoardOrAdmin` gate rather than adding a new rule.
 */
export function MessagesTabs({
  active,
  showInbox,
  draftCount,
  className,
}: {
  active: MessagesTabKey | null
  showInbox: boolean
  /** Shown as the Drafts badge when the page already has it; never fetched here. */
  draftCount?: number | null
  className?: string
}) {
  const items = messagesTabsFor(active, { showInbox }).map((t) => ({
    label: t.label,
    href: t.href,
    active: t.active,
    badge: t.key === 'drafts' && draftCount ? draftCount : null,
  }))
  return <Tabs items={items} linkAs={Link} aria-label="Messages" className={className} />
}
