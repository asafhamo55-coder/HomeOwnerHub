import { Shield } from 'lucide-react'
import { Alert, BackLink, Card, CardContent, CardHeader, CardTitle, PageHeader } from '@homeowner-portal/ui'
import { ReportViolationForm } from './ReportViolationForm'

export const metadata = { title: 'Report a concern' }

export default function ReportViolationPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/resident" label="Back to My Home" />

      <PageHeader
        title="Report a concern"
        description="Let the board know about a possible rule violation or community issue. The board will review and decide whether to open a formal violation."
      />

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
