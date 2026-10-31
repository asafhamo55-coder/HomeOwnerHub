import Link from 'next/link'
import { Page } from '@homeowner-portal/ui'
import { listEventNotifyProperties } from '@/lib/events'
import { EventForm } from '../EventForm'
import { titleFromParam } from '../deadline-chips'

export const metadata = { title: 'New event' }

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string | string[] }>
}) {
  const defaultTitle = titleFromParam((await searchParams).title)
  const properties = await listEventNotifyProperties()
  return (
    <Page
      width="narrow"
      title="New event"
      description="A dated reminder — annual meeting, insurance renewal, budget deadline. We alert the people you choose ahead of each occurrence."
      breadcrumbs={[{ label: 'Events', href: '/events' }, { label: 'New' }]}
      linkAs={Link}
    >
      <EventForm properties={properties} defaultTitle={defaultTitle} />
    </Page>
  )
}
