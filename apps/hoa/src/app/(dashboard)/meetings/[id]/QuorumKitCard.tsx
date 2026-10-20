import Link from 'next/link'
import { Users } from 'lucide-react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@homeowner-portal/ui'

/**
 * BL-122: the meeting page's way into the quorum kit. Shown for the annual
 * meeting, and for a special meeting (the kit asks the board to confirm it
 * is a members' meeting). Board meetings get nothing.
 */
export function QuorumKitCard({ meetingId, meetingType }: { meetingId: string; meetingType: string | null }) {
  if (meetingType !== 'annual' && meetingType !== 'special') return null
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Users className="size-4 text-muted" aria-hidden />
          Quorum kit
        </CardTitle>
        <CardDescription>
          {meetingType === 'annual'
            ? 'Sign-in sheet, proxy forms, the homes with no proxy yet, and a live quorum count.'
            : 'If owners vote at this meeting: sign-in sheet, proxy forms and a live quorum count.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="secondary" size="sm">
          <Link href={`/meetings/${meetingId}/quorum`}>Open quorum kit</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
