import { Alert, BackLink, Card, CardContent, CardHeader, CardTitle, PageHeader } from '@homeowner-portal/ui'
import { getResidentUnits } from '@/lib/resident'
import { ArcRequestForm } from './ArcRequestForm'

export const metadata = { title: 'New ARC application' }

export default async function NewArcRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ summary?: string; scope?: string }>
}) {
  const units = await getResidentUnits()
  const { summary, scope } = await searchParams

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/resident/arc" label="Back to my ARC applications" />

      <PageHeader
        title="Architectural Review application"
        description="Submit a request for an exterior change to your unit. The board's Architectural Review Committee will review and respond within thirty (30) days per the Declaration."
      />

      <Alert variant="info" title="Before you submit">
        <span className="block text-sm">
          Don't start work before you receive a written approval. Per the
          governing documents, work commenced without approval may need to
          be removed at your expense.
        </span>
      </Alert>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Application</CardTitle>
        </CardHeader>
        <CardContent>
          <ArcRequestForm
            units={units}
            defaultSummary={summary}
            defaultScope={scope}
          />
        </CardContent>
      </Card>
    </div>
  )
}
