import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardContent, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { pollsAvailable } from '@/lib/polls/store'
import { NewPollForm } from '@/components/polls/NewPollForm'
import { PollNotice } from '@/components/polls/PollNotice'

export const metadata = { title: 'New poll' }

export default async function NewPollPage() {
  if (!pollsAvailable()) notFound()
  await requireBoardOrAdmin()
  return (
    <Page
      width="narrow"
      title="New poll"
      description="Residents answer in their portal. You see the totals."
      breadcrumbs={[{ label: 'Polls', href: '/polls' }, { label: 'New poll' }]}
      linkAs={Link}
    >
      <PollNotice />
      <Card>
        <CardContent className="pt-5">
          <NewPollForm />
        </CardContent>
      </Card>
    </Page>
  )
}
