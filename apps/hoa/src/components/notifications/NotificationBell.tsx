// Server component. Fetches the signed-in board member's notifications
// once per navigation and hands the dropdown a fully-rendered view model.
//
// The split matters: doing the formatting here rather than in the client
// component keeps three things off the browser. The relative-age label is
// computed from one server clock, so it cannot mismatch between SSR and
// hydration; the stored `link` is validated before it is ever an href; and
// the raw row — org id, user id, entity ids — never crosses the wire.
//
// Everything underneath degrades to empty rather than throwing (migration
// 0053 is not applied yet, see lib/notifications.ts), so this renders a
// quiet bell with no badge instead of taking the header down.

import { getMyNotifications, getMyUnreadCount } from '@/lib/notifications'
import {
  formatNotificationAge,
  formatUnreadBadge,
  safeNotificationHref,
} from '@/lib/notifications-format'
import { NotificationBellMenu, type BellItem } from './NotificationBellMenu'

export async function NotificationBell() {
  // One clock for the whole list. Formatting each row against its own
  // `new Date()` would let two rows a millisecond apart land on different
  // sides of a boundary and read as "1m ago" above "just now".
  const now = new Date()

  const [rows, unreadCount] = await Promise.all([getMyNotifications(), getMyUnreadCount()])

  const items: BellItem[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    href: safeNotificationHref(row.link),
    age: formatNotificationAge(row.created_at, now),
    unread: row.read_at === null,
  }))

  return (
    <NotificationBellMenu
      items={items}
      unreadCount={unreadCount}
      badge={formatUnreadBadge(unreadCount)}
    />
  )
}
