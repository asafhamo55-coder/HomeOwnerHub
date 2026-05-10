import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { loadDraft } from '@/lib/drafts'
import { MeetingWizard } from '../MeetingWizard'

export const metadata = { title: 'New minutes' }

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
    initialDraft && initialDraft.kind === 'meeting' && !initialDraft.completed
      ? initialDraft
      : null

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/meetings"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-fg hover:text-muted"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to meetings
      </Link>

      {usableDraft ? (
        <Alert variant="info" title="Resumed unfinished draft">
          Your transcript and meeting details are restored. The wizard autosaves as you progress.
        </Alert>
      ) : null}

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>{usableDraft ? 'Resume meeting minutes' : 'Record meeting minutes'}</CardTitle>
        </CardHeader>
        <CardContent>
          <MeetingWizard initialDraft={usableDraft} />
        </CardContent>
      </Card>
    </div>
  )
}
