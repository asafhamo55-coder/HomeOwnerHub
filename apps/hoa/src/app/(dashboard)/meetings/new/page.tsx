import Link from 'next/link'
import { Alert, Card, CardContent, Page } from '@homeowner-portal/ui'
import { loadDraft } from '@/lib/drafts'
import { todayIn } from '@/lib/association-time'
import { currentTimeZone } from '@/lib/association-time-current'
import { MeetingWizard } from '../MeetingWizard'

export const metadata = { title: 'Record minutes' }

interface SearchParams {
  draft?: string
}

export default async function NewMeetingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { draft: draftId } = await searchParams
  const initialDraft = draftId ? await loadDraft(draftId) : null
  const usableDraft =
    initialDraft && initialDraft.kind === 'meeting' && !initialDraft.completed ? initialDraft : null
  // The association's today (BL-065): the meeting date's default.
  const today = todayIn(await currentTimeZone())

  return (
    <Page
      width="narrow"
      title={usableDraft ? 'Resume meeting minutes' : 'Record meeting minutes'}
      description="Paste the transcript or your notes. AI drafts formal minutes; the board edits and approves them before they go on the record."
      breadcrumbs={[{ label: 'Meetings', href: '/meetings' }, { label: 'Record minutes' }]}
      linkAs={Link}
    >
      {usableDraft ? (
        <Alert variant="info" title="Resumed unfinished draft">
          Your transcript and meeting details are restored. The wizard autosaves as you progress.
        </Alert>
      ) : null}
      <Card>
        <CardContent className="pt-5">
          <MeetingWizard initialDraft={usableDraft} today={today} />
        </CardContent>
      </Card>
    </Page>
  )
}
