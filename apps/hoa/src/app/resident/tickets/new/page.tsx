import { BackLink, Card, CardContent, CardHeader, CardTitle, PageHeader } from '@homeowner-portal/ui'
import { getResidentUnits } from '@/lib/resident'
import { CreateTicketForm } from './CreateTicketForm'

export const metadata = { title: 'New Ticket' }

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; description?: string }>
}) {
  const units = await getResidentUnits()
  const { subject, description } = await searchParams

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/resident/tickets" label="Back to my tickets" />

      <PageHeader
        title="Open a support ticket"
        description="Describe your issue and the board will respond within the system."
      />

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Ticket details</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateTicketForm
            units={units}
            defaultSubject={subject}
            defaultDescription={description}
          />
        </CardContent>
      </Card>
    </div>
  )
}
