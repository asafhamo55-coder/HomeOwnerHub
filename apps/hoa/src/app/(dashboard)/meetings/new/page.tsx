import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@homeownerhub/ui'
import { MeetingWizard } from '../MeetingWizard'

export const metadata = { title: 'New minutes' }

export default function NewMeetingPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/meetings"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-fg hover:text-muted"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to meetings
      </Link>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Record meeting minutes</CardTitle>
        </CardHeader>
        <CardContent>
          <MeetingWizard />
        </CardContent>
      </Card>
    </div>
  )
}
