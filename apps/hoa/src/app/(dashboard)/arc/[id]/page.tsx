import Link from 'next/link'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { formatDay } from '@/lib/money/format'
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  KeyValue,
  KeyValueList,
  Page,
  StatusBadge,
} from '@homeowner-portal/ui'
import { getArcRequestForBoard, getArcMessagesForBoard } from '@/lib/board-review'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadArcReview } from '@/lib/arc-review/load'
import { photosChanged } from '@/lib/arc-review/model'
import { selectArcPhotos } from '@/lib/arc-review/photos'
import { resolveArcReviewMaxPhotos } from '@homeowner-portal/workflows/W37'
import { ArcReviewPanel } from '@/components/arc-review/ArcReviewPanel'
import { listSubmissionAttachments } from '@/lib/submission-attachments'
import { SubmissionAttachments } from '@/components/attachments/SubmissionAttachments'
import { BoardConversation } from '@/components/board-review/BoardConversation'
import { ARC_CATEGORY, ARC_STATUS } from '@/lib/status/community'
import { ArcDecisionForm } from './ArcDecisionForm'
import { ArcBoardReplyForm } from './ArcBoardReplyForm'
import { ArcActions } from './ArcActions'

export const metadata = { title: 'ARC application' }
// Force a fresh render after a board decision — without this the client
// router can serve the cached segment and the status looks unchanged even
// though the write landed.
export const dynamic = 'force-dynamic'

// Only used for proposed_start/proposed_completion, which are DATE columns.
const date = (iso: string | null) => (iso ? formatDay(iso) : null)

export default async function ArcReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // Board-only gate before any client is created (the dashboard layout
  // already sends residents away).
  const { org } = await requireBoardOrAdmin()
  const arc = await getArcRequestForBoard(id)
  if (!arc) notFound()
  const supabase = await getSupabaseServerClient()
  const [messages, attachments, aiReview] = await Promise.all([
    getArcMessagesForBoard(id),
    listSubmissionAttachments('arc', id),
    // BL-027: the W37 draft (and the resident's BL-024 pre-check). A failed
    // read is its own state on the card; the application still renders.
    loadArcReview(supabase, org.id, id),
  ])

  const decided = arc.status === 'approved' || arc.status === 'denied'
  // BL-079: name and link each photo finding, and offer a re-run when the
  // photos the review would read now differ from the ones it read.
  const photoLinks = Object.fromEntries(attachments.map((a) => [a.id, { fileName: a.fileName, url: a.signedUrl }]))
  const currentPhotoIds = selectArcPhotos(attachments, resolveArcReviewMaxPhotos()).selected.map((p) => p.id)
  const reviewPhotosChanged = aiReview.ok && aiReview.review ? photosChanged(aiReview.review.photoIds, currentPhotoIds) : false
  const submitter = arc.submitter_name ?? arc.submitter_email ?? 'Unknown submitter'

  return (
    <Page
      width="wide"
      title={arc.summary}
      breadcrumbs={[{ label: 'ARC review', href: '/arc' }, { label: arc.summary }]}
      linkAs={Link}
      meta={
        <>
          <StatusBadge status={arc.status} tones={ARC_STATUS.tones} labels={ARC_STATUS.labels} />
          <Badge variant="neutral">{ARC_CATEGORY[arc.category] ?? arc.category}</Badge>
        </>
      }
      description={
        <>
          {submitter}
          {arc.unit_number ? ` · Unit ${arc.unit_number}` : ''} · submitted{' '}
          <time dateTime={arc.submitted_at}>{format(new Date(arc.submitted_at), 'PP')}</time>
        </>
      }
      actions={<ArcActions arcId={arc.id} />}
    >
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Proposed work</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{arc.scope_description}</p>
              <KeyValueList className="border-t border-border pt-4 sm:grid-cols-4">
                <KeyValue label="Proposed start" value={date(arc.proposed_start)} />
                <KeyValue label="Proposed completion" value={date(arc.proposed_completion)} />
                <KeyValue label="Contractor" value={arc.contractor_name} />
                <KeyValue label="License #" value={arc.contractor_license} />
              </KeyValueList>
            </CardContent>
          </Card>

          {arc.status === 'withdrawn' && !(aiReview.ok && aiReview.review) ? null : (
            <ArcReviewPanel
              arcId={arc.id}
              title={arc.summary}
              arcStatus={arc.status}
              load={aiReview}
              associationName={org.name}
              photos={photoLinks}
              photosChanged={reviewPhotosChanged}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle as="h2">Conversation</CardTitle>
              <CardDescription>Replies go to the resident&apos;s portal. Internal notes stay with the board.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <BoardConversation
                messages={messages}
                residentLabel="Resident"
                emptyHint="No messages yet. Ask the resident for samples, drawings or a contractor quote."
              />
              <div className="border-t border-border pt-5">
                <ArcBoardReplyForm arcId={arc.id} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Documents</CardTitle>
              <CardDescription>Plans, photos and quotes attached to this application.</CardDescription>
            </CardHeader>
            <CardContent>
              <SubmissionAttachments threadType="arc" parentId={arc.id} attachments={attachments} canDelete />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-20">
          {arc.status === 'withdrawn' ? (
            <Card variant="subtle">
              <CardHeader>
                <CardTitle as="h2">Withdrawn</CardTitle>
                <CardDescription>The resident withdrew this application. No decision is needed.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle as="h2">{decided ? 'Update decision' : 'Decision'}</CardTitle>
                {decided && arc.board_response_at ? (
                  <CardDescription>
                    {ARC_STATUS.labels[arc.status]} on{' '}
                    <time dateTime={arc.board_response_at}>{format(new Date(arc.board_response_at), 'PP')}</time>
                  </CardDescription>
                ) : (
                  <CardDescription>The resident sees the decision and your response in their portal.</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <ArcDecisionForm arcId={arc.id} currentResponse={arc.board_response} currentStatus={arc.status} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Page>
  )
}
