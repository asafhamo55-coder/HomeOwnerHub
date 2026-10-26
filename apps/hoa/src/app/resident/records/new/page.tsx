import { notFound } from 'next/navigation'
import { Home } from 'lucide-react'
import { RECORDS_REQUESTS_LIVE } from '@homeowner-portal/db/records-requests'
import { getResidentUnits } from '@/lib/resident'
import { Panel, ScreenEmpty, ScreenHeader } from '@/components/resident/screen'
import { RECORDS_KIND_VALUES, type RecordsKind } from '@/lib/records-requests/law'
import { RecordsRequestForm } from './RecordsRequestForm'
import { AskToJoinLink } from '@/components/resident/AskToJoinLink'

export const metadata = { title: 'Request association records' }
export const dynamic = 'force-dynamic'

/**
 * BL-123 (3): an owner asks to see association records. 404 until
 * RECORDS_REQUESTS_LIVE (packages/db/src/records-requests.ts).
 */
export default async function NewRecordsRequestPage(props: { searchParams?: Promise<{ kind?: string }> } = {}) {
  if (!RECORDS_REQUESTS_LIVE) notFound()
  // ?kind= presets "Which records?" (BL-162: /resident/insurance links here
  // with kind=insurance_certificate). Anything unknown is ignored.
  const rawKind = (await props.searchParams)?.kind
  const defaultKind = (RECORDS_KIND_VALUES as readonly string[]).includes(rawKind ?? '') ? (rawKind as RecordsKind) : undefined
  const units = await getResidentUnits()

  return (
    <div className="space-y-6">
      <ScreenHeader
        back={{ href: '/resident/requests', label: 'Requests' }}
        title="Request association records"
        subtitle="Ask to see the association’s records. The board replies here."
      />

      {units.length === 0 ? (
        <ScreenEmpty
          icon={<Home />}
          title="No home linked yet"
          description="Records requests come from owners. Once your community manager links you to your home, you can send one here."
          action={<AskToJoinLink />}
        />
      ) : (
        <Panel className="space-y-4 p-5">
          <RecordsRequestForm units={units} defaultKind={defaultKind} />
        </Panel>
      )}
    </div>
  )
}
