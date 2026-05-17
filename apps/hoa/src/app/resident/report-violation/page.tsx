import Link from 'next/link'
import { ArrowLeft, Shield } from 'lucide-react'
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { ReportViolationForm } from './ReportViolationForm'

export const metadata = { title: 'Report a concern' }

export default function ReportViolationPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/resident"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to My Home
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Report a concern</h1>
        <p className="text-sm text-muted">
          Let the board know about a possible rule violation or community
          issue. The board will review and decide whether to open a formal
          violation.
        </p>
      </header>

      <Alert variant="info" title="Your identity stays confidential">
        <span className="block text-sm">
          <Shield className="mr-1 inline h-3.5 w-3.5" />
          The board sees that a report was submitted but per Policy &sect;12.03
          your identity is kept confidential where practicable. We don't
          act on anonymous reports though, so we do record who submitted.
        </span>
      </Alert>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Tell the board what you saw</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportViolationForm />
        </CardContent>
      </Card>
    </div>
  )
}
