import { BackLink, Card, CardContent, CardHeader, CardTitle, PageHeader } from '@homeowner-portal/ui'
import { listUnitsForDues } from '@/lib/assessments'
import { NewDueForm } from './NewDueForm'

export const metadata = { title: 'Add due' }

export default async function NewDuePage(): Promise<React.ReactElement> {
  const units = await listUnitsForDues()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackLink href="/dues" label="Back to dues" />
      <PageHeader title="Add a due" />

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Billing details</CardTitle>
        </CardHeader>
        <CardContent>
          <NewDueForm units={units} />
        </CardContent>
      </Card>
    </div>
  )
}
