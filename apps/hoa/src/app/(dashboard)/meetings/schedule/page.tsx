import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { ScheduleMeetingForm } from './ScheduleMeetingForm'

export const metadata = { title: 'Schedule meeting' }

export default function ScheduleMeetingPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/meetings"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to meetings
      </Link>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Schedule a board meeting</CardTitle>
        </CardHeader>
        <CardContent>
          <ScheduleMeetingForm />
        </CardContent>
      </Card>
    </div>
  )
}
