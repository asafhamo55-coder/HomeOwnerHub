import { Home } from 'lucide-react'
import { getResidentUnits } from '@/lib/resident'
import { Panel, ScreenEmpty, ScreenHeader } from '@/components/resident/screen'
import { CreateTicketForm } from './CreateTicketForm'

export const metadata = { title: 'New request' }

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; description?: string }>
}) {
  const units = await getResidentUnits()
  const { subject, description } = await searchParams

  return (
    <div className="space-y-6">
      <ScreenHeader
        back={{ href: '/resident/requests', label: 'Requests' }}
        title="New support request"
        subtitle="Tell the board what's going on. You'll get replies right here."
      />

      {units.length === 0 ? (
        <ScreenEmpty
          icon={<Home />}
          title="No home linked yet"
          description="Requests are filed against your home. Once your community manager links you to a unit, you can send one here."
        />
      ) : (
        <Panel className="p-5">
          <CreateTicketForm units={units} defaultSubject={subject} defaultDescription={description} />
        </Panel>
      )}
    </div>
  )
}
