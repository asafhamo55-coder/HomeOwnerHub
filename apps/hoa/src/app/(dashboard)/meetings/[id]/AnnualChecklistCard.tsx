import Link from 'next/link'
import { CheckCircle2, Circle, ClipboardList } from 'lucide-react'
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { annualProgress, deriveAnnualSteps } from '@/lib/meetings/annual-steps'
import { loadMeetingNoticeStatus, type NoticeMeeting } from '@/lib/meetings/notice-queries'

/**
 * Round 15: ordered progress for an annual meeting. Reads the notice
 * status through the same loader as the Notice to owners card; the other
 * steps link to their cards' screens. Annual meetings only.
 */
export async function AnnualChecklistCard({ meeting, held }: { meeting: NoticeMeeting; held: boolean }) {
  if (meeting.meetingType !== 'annual') return null
  const { check, latest } = await loadMeetingNoticeStatus(meeting)
  const steps = deriveAnnualSteps({
    meetingId: meeting.id,
    meetingType: meeting.meetingType,
    status: meeting.status,
    held,
    state: check?.state ?? null,
    notice: latest,
  })
  const { done, total } = annualProgress(steps)

  return (
    <Card data-testid="annual-checklist">
      <CardHeader>
        <CardTitle as="h2" className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <ClipboardList className="size-4 text-muted" aria-hidden />
            Annual meeting checklist
          </span>
          <Badge variant="neutral" className="num">
            {done} of {total} done
          </Badge>
        </CardTitle>
        <CardDescription>Steps marked Check have no saved status. Open each to confirm.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-1">
          {steps.map((s) => (
            <li key={s.key}>
              <Link
                href={s.href}
                className="flex min-h-11 items-start gap-2.5 rounded-md py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {s.done ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                )}
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                    {s.label}
                    <span className="sr-only">{s.done ? ', done' : s.status === 'check' ? ', check' : ', to do'}</span>
                    {s.status === 'check' ? (
                      <Badge variant="neutral" aria-hidden>
                        Check
                      </Badge>
                    ) : null}
                  </span>
                  <span className="block text-xs text-muted">{s.hint}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
