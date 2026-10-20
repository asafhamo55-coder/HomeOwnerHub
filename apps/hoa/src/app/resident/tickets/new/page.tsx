import { Home } from 'lucide-react'
import { getResidentUnits } from '@/lib/resident'
import { Panel, ScreenEmpty, ScreenHeader } from '@/components/resident/screen'
import { Alert } from '@homeowner-portal/ui'
import { FROM_ASSISTANT_VALUE, SUGGESTED_BY_ASSISTANT } from '@/lib/resident-assistant/handoff'
import { CreateTicketForm } from './CreateTicketForm'

export const metadata = { title: 'New request' }

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; description?: string; from?: string }>
}) {
  const units = await getResidentUnits()
  const { subject, description, from } = await searchParams
  const suggested = from === FROM_ASSISTANT_VALUE && Boolean(subject || description)

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
        <Panel className="space-y-4 p-5">
          {suggested ? <Alert variant="info" title={SUGGESTED_BY_ASSISTANT} /> : null}
          <CreateTicketForm units={units} defaultSubject={subject} defaultDescription={description} />
        </Panel>
      )}
    </div>
  )
}
