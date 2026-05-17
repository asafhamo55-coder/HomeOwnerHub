import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { NewRfpForm } from './NewRfpForm'

export const metadata = { title: 'New RFP' }

export default function NewRfpPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/rfps"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to RFPs
      </Link>

      <header className="space-y-1">
        <h1>Draft an RFP</h1>
        <p className="text-sm text-muted">
          Describe what your association needs and the RFP Composer
          (W22) turns it into a structured document — scope, line items,
          evaluation criteria, insurance requirements pulled from your
          association settings.
        </p>
      </header>

      <Alert variant="info" title="Insurance numbers come from your settings">
        <span className="block text-sm">
          The composer copies insurance minima verbatim from{' '}
          <span className="font-mono">associations.compliance_settings</span>{' '}
          — it does not invent numbers. If a value is missing the draft
          will land with HIGH/MEDIUM/LOW confidence reflecting that.
        </span>
      </Alert>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>What do you need?</CardTitle>
        </CardHeader>
        <CardContent>
          <NewRfpForm />
        </CardContent>
      </Card>
    </div>
  )
}
