import Link from 'next/link'
import { format } from 'date-fns'
import { Megaphone } from 'lucide-react'
import { Button, LoadFailed } from '@homeowner-portal/ui'
import type { LatestAnnouncement } from '@/lib/resident-latest-announcement'
import { IconTile, Panel, TappableRow } from '@/components/resident/screen'

export function LatestAnnouncementCard({
  announcement,
  failed,
}: {
  announcement: LatestAnnouncement | null
  failed: boolean
}) {
  if (failed) return <LoadFailed what="your latest announcement" />
  if (!announcement) {
    return (
      <TappableRow
        href="/resident/announcements"
        icon={<Megaphone />}
        tone="slate"
        title="No announcements yet"
        subtitle="Messages from your board will show up here"
      />
    )
  }
  return (
    <Panel className="space-y-3">
      <div className="flex items-start gap-3">
        <IconTile icon={<Megaphone />} tone="info" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{announcement.subject}</p>
          <p className="num text-xs text-muted">{format(new Date(announcement.sentAt), 'PP')}</p>
          {announcement.preview ? (
            <p className="pt-1 text-sm text-foreground-secondary [overflow-wrap:anywhere]">{announcement.preview}</p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm">
          <Link href={`/resident/announcements#${announcement.id}`}>Read it</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/resident/announcements">See all</Link>
        </Button>
      </div>
    </Panel>
  )
}
