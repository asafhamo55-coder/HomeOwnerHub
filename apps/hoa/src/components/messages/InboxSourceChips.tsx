import Link from 'next/link'
import { FilterChips } from '@homeowner-portal/ui'
import { ANNOUNCEMENT_REPLIES_HREF } from '@/lib/messages/tabs'

/**
 * Inside the Messages Inbox tab: resident email (the Gmail inbox threads)
 * or the read-only "Replies to announcements" (communication_replies).
 * BL-102 A11. Links only; no counts, so no extra query per page load.
 */
export function InboxSourceChips({ view }: { view: 'email' | 'replies' }) {
  return (
    <FilterChips
      label="Which messages"
      linkAs={Link}
      className="w-fit max-w-full"
      items={[
        { label: 'Resident email', href: '/inbox', active: view === 'email' },
        { label: 'Replies to announcements', href: ANNOUNCEMENT_REPLIES_HREF, active: view === 'replies' },
      ]}
    />
  )
}
