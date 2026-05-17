import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { getResidentUnits } from '@/lib/resident'
import { ArcRequestForm } from './ArcRequestForm'

export const metadata = { title: 'New ARC application' }

export default async function NewArcRequestPage() {
  const units = await getResidentUnits()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/resident/arc"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to my ARC applications
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Architectural Review application</h1>
        <p className="text-sm text-muted">
          Submit a request for an exterior change to your unit. The board's
          Architectural Review Committee will review and respond within
          thirty (30) days per the Declaration.
        </p>
      </header>

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
          <ArcRequestForm units={units} />
        </CardContent>
      </Card>
    </div>
  )
}
