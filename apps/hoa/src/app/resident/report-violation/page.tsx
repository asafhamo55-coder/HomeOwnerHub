import { Alert } from '@homeowner-portal/ui'
import { Panel, ScreenHeader } from '@/components/resident/screen'
import { ReportViolationForm } from './ReportViolationForm'

export const metadata = { title: 'Report a concern' }

export default async function ReportViolationPage({
  searchParams,
}: {
  searchParams: Promise<{ description?: string }>
}) {
  const { description } = await searchParams

  return (
    <div className="space-y-6">
      <ScreenHeader
        back={{ href: '/resident/requests', label: 'Requests' }}
        title="Report a concern"
        subtitle="Tell the board about a possible rule violation or community issue. They'll review it and decide whether to act."
      />

      <Alert variant="info" title="Your identity stays confidential">
        We keep your identity confidential where we can. The board sees who reported.
      </Alert>

      <Panel className="p-5">
        <ReportViolationForm defaultDescription={description} />
      </Panel>
    </div>
  )
}
