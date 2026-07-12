import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { CheckCircle2, MessageSquare } from 'lucide-react'
import {
  BackLink,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
} from '@homeowner-portal/ui'
import { getMyArcRequest, type ArcStatus } from '@/lib/resident-submissions'
import { ArcReplyForm } from './ArcReplyForm'
import { WithdrawArcButton } from './WithdrawArcButton'

export const metadata = { title: 'ARC application' }

const STATUS_VARIANT: Record<ArcStatus, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  submitted: 'outline',
  in_review: 'warning',
  approved: 'success',
  denied: 'destructive',
  withdrawn: 'outline',
}

const CATEGORY_LABEL: Record<string, string> = {
  paint: 'Paint',
  fence: 'Fence',
  deck_patio: 'Deck / patio',
  roof: 'Roof',
  landscaping: 'Landscaping',
  addition: 'Addition',
  pool: 'Pool / spa',
  solar: 'Solar',
  other: 'Other',
}

// A resident can still discuss and withdraw while the board is deciding.
// Once a decision lands (or they withdraw), the thread is read-only.
const PENDING: ArcStatus[] = ['submitted', 'in_review']

export default async function ResidentArcDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const arc = await getMyArcRequest(id)
  if (!arc) notFound()

  const pending = PENDING.includes(arc.status)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/resident/arc" label="Back to my applications" />

      <PageHeader
        title={arc.summary}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" size="sm">
              {CATEGORY_LABEL[arc.category] ?? arc.category}
            </Badge>
            <Badge variant={STATUS_VARIANT[arc.status]} size="sm">
              {arc.status.replace('_', ' ')}
            </Badge>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What you asked for</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="whitespace-pre-wrap">{arc.scope_description}</p>
          <div className="grid gap-1 border-t border-border pt-3 text-xs text-muted sm:grid-cols-2">
            <KV
              label="Proposed start"
              value={arc.proposed_start ? format(new Date(arc.proposed_start), 'PP') : null}
            />
            <KV
              label="Proposed completion"
              value={arc.proposed_completion ? format(new Date(arc.proposed_completion), 'PP') : null}
            />
            <KV label="Contractor" value={arc.contractor_name} />
            <KV label="License #" value={arc.contractor_license} />
          </div>
          <p className="text-xs text-muted">
            Submitted {format(new Date(arc.submitted_at), 'PPp')}
          </p>
        </CardContent>
      </Card>

      {arc.board_response ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4" />
                Board decision
              </CardTitle>
              {arc.board_response_at ? (
                <span className="text-xs text-muted">
                  {format(new Date(arc.board_response_at), 'PP')}
                </span>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{arc.board_response}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" />
            Conversation
          </CardTitle>
        </CardHeader>
        <CardContent>
          {arc.messages.length === 0 ? (
            <p className="text-sm text-muted">
              No messages yet. Ask a question below and the board will reply here.
            </p>
          ) : (
            <ul className="space-y-4">
              {arc.messages.map((m) => (
                <li key={m.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {m.author_role === 'resident' ? 'You' : 'Board'}
                    </span>
                    <Badge
                      variant={m.author_role === 'resident' ? 'outline' : 'default'}
                      size="sm"
                    >
                      {m.author_role}
                    </Badge>
                    <span className="text-xs text-muted">
                      {format(new Date(m.created_at), 'PPp')}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {pending ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add a message</CardTitle>
            </CardHeader>
            <CardContent>
              <ArcReplyForm arcId={arc.id} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <p className="text-sm text-muted">
                Changed your mind? You can withdraw this application while it's
                still under review.
              </p>
              <WithdrawArcButton arcId={arc.id} />
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-4">
            <p className="text-center text-sm text-muted">
              This application is {arc.status.replace('_', ' ')}. To propose a new
              change, submit a new application.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function KV({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span>{label}</span>
      <span className="truncate text-right text-foreground">
        {value == null || value === '' ? <span className="text-muted">—</span> : value}
      </span>
    </div>
  )
}
