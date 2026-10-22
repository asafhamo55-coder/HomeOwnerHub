import Link from 'next/link'
import { FileText } from 'lucide-react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@homeowner-portal/ui'

/**
 * BL-153: the meeting page's way into the owner annual report. Shown for
 * the annual meeting only; board meetings use the board packet.
 */
export function AnnualReportCard({ meetingId, meetingType }: { meetingId: string; meetingType: string | null }) {
  if (meetingType !== 'annual') return null
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <FileText className="size-4 text-muted" aria-hidden />
          Annual report to owners
        </CardTitle>
        <CardDescription>
          The year’s finances, reserves, next year’s budget, insurance and motions, in totals any owner may see. Print it or draft a message.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="secondary" size="sm">
          <Link href={`/meetings/${meetingId}/annual-report`}>Open annual report</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
