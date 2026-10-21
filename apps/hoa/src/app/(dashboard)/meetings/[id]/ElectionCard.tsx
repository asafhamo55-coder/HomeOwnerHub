import Link from 'next/link'
import { Vote } from 'lucide-react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@homeowner-portal/ui'

/**
 * BL-141: the meeting page's way into the election planner. Shown for the
 * annual meeting, and for a special meeting (the planner asks the board to
 * confirm owners vote at it). Board meetings get nothing.
 */
export function ElectionCard({ meetingId, meetingType }: { meetingId: string; meetingType: string | null }) {
  if (meetingType !== 'annual' && meetingType !== 'special') return null
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Vote className="size-4 text-muted" aria-hidden />
          Board election
        </CardTitle>
        <CardDescription>
          Your state’s election dates, candidates checked against the ledger, a printable ballot kit and the results.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="secondary" size="sm">
          <Link href={`/meetings/${meetingId}/election`}>Plan the election</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
