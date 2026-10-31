import Link from 'next/link'
import { Megaphone } from 'lucide-react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { NoticeLawAlert } from '@/components/meetings/NoticeLawAlert'
import { loadMeetingNoticeStatus, type NoticeMeeting } from '@/lib/meetings/notice-queries'
import { formatShortDate } from '@/lib/format-datetime'

/**
 * BL-118: "Send meeting notice" on a scheduled meeting. One self-contained
 * section: the button (opens the composer prefilled; nothing sends until
 * the board presses Send there), the state's minimum notice checked
 * against today, and when a notice went out — read from the
 * communication record, which works before and after M1.
 */
export async function MeetingNoticeSection({ meeting }: { meeting: NoticeMeeting }) {
  const { check, latest, canSend } = await loadMeetingNoticeStatus(meeting)

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Megaphone className="size-4 text-muted" aria-hidden />
          Notice to owners
        </CardTitle>
        <CardDescription>Email and portal notice to every owner, with an add-to-calendar link.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {latest === 'failed' ? (
          <p className="text-sm text-muted">Couldn’t check whether a notice was sent.</p>
        ) : latest ? (
          <p className="text-sm text-foreground">
            {latest.status === 'scheduled' ? 'Notice scheduled for ' : 'Notice sent on '}
            <Link href={`/communications/${latest.communicationId}`} className="font-medium text-primary underline-offset-2 hover:underline">
              {formatShortDate(latest.at)}
            </Link>
          </p>
        ) : (
          <p className="text-sm text-muted">No notice sent from HomeownerHub yet.</p>
        )}
        {canSend && check ? <NoticeLawAlert check={check} /> : null}
        {canSend ? (
          <Button asChild variant="secondary" className="w-full">
            <Link href={`/communications/new?meeting=${meeting.id}`}>
              <Megaphone className="size-4" aria-hidden />
              {latest && latest !== 'failed' ? 'Send another notice' : 'Send meeting notice'}
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
