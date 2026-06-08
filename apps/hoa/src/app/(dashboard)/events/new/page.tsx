import {
  BackLink,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@homeowner-portal/ui'
import { NewEventForm } from './NewEventForm'
import { listEventNotifyProperties } from '@/lib/events'

export const metadata = { title: 'New event' }

export default async function NewEventPage() {
  const properties = await listEventNotifyProperties()
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackLink href="/events" label="Events" />
      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Create a recurring event</CardTitle>
        </CardHeader>
        <CardContent>
          <NewEventForm properties={properties} />
        </CardContent>
      </Card>
    </div>
  )
}
