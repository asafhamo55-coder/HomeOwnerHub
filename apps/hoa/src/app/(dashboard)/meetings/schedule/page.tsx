import Link from 'next/link'
import { Page } from '@homeowner-portal/ui'
import { ScheduleMeetingForm } from './ScheduleMeetingForm'

export const metadata = { title: 'Schedule meeting' }

export default function ScheduleMeetingPage() {
  return (
    <Page
      width="narrow"
      title="Schedule a meeting"
      description="Put the next meeting on the board calendar. It shows on the dashboard and under Upcoming until you record its minutes."
      breadcrumbs={[{ label: 'Meetings', href: '/meetings' }, { label: 'Schedule' }]}
      linkAs={Link}
    >
      <ScheduleMeetingForm />
    </Page>
  )
}
