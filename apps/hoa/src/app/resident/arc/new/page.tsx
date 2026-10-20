import { Home } from 'lucide-react'
import { Alert } from '@homeowner-portal/ui'
import { getResidentUnits } from '@/lib/resident'
import { Panel, ScreenEmpty, ScreenHeader } from '@/components/resident/screen'
import { FROM_ASSISTANT_VALUE, SUGGESTED_BY_ASSISTANT } from '@/lib/resident-assistant/handoff'
import { ArcRequestForm } from './ArcRequestForm'

export const metadata = { title: 'New ARC application' }

export default async function NewArcRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ summary?: string; scope?: string; from?: string }>
}) {
  const units = await getResidentUnits()
  const { summary, scope, from } = await searchParams
  const suggested = from === FROM_ASSISTANT_VALUE && Boolean(summary || scope)

  return (
    <div className="space-y-6">
      <ScreenHeader
        back={{ href: '/resident/arc', label: 'ARC applications' }}
        title="New ARC application"
        subtitle="Ask the Architectural Review Committee to approve an exterior change. They respond within 30 days per the Declaration."
      />

      {units.length === 0 ? (
        <ScreenEmpty
          icon={<Home />}
          title="No home linked yet"
          description="Applications are filed against your home. Once your community manager links you to a unit, you can apply here."
        />
      ) : (
        <>
          <Alert variant="info" title="Wait for written approval">
            Don&apos;t start work before the board approves it. Work started without approval may need
            to be removed at your expense.
          </Alert>
          <Panel className="space-y-4 p-5">
            {suggested ? <Alert variant="info" title={SUGGESTED_BY_ASSISTANT} /> : null}
            <ArcRequestForm units={units} defaultSummary={summary} defaultScope={scope} />
          </Panel>
        </>
      )}
    </div>
  )
}
