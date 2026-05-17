import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import {
  getArcRequestForBoard,
  type ArcStatus,
} from '@/lib/board-review'
import { ArcDecisionForm } from './ArcDecisionForm'

export const metadata = { title: 'ARC application' }

const STATUS_VARIANT: Record<ArcStatus, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  submitted: 'warning',
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

export default async function ArcReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const arc = await getArcRequestForBoard(id)
  if (!arc) notFound()

  const decided =
    arc.status === 'approved' || arc.status === 'denied'

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/arc"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to ARC queue
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{arc.summary}</h1>
          <p className="mt-1 text-xs text-muted">
            {arc.submitter_name ?? arc.submitter_email ?? '(unknown submitter)'}
            {arc.unit_number ? ` · unit ${arc.unit_number}` : ''}
            {' · submitted '}
            {format(new Date(arc.submitted_at), 'PP')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{CATEGORY_LABEL[arc.category] ?? arc.category}</Badge>
          <Badge variant={STATUS_VARIANT[arc.status]}>
            {arc.status.replace('_', ' ')}
          </Badge>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scope</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{arc.scope_description}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <KV
              label="Proposed start"
              value={
                arc.proposed_start
                  ? format(new Date(arc.proposed_start), 'PP')
                  : null
              }
            />
            <KV
              label="Proposed completion"
              value={
                arc.proposed_completion
                  ? format(new Date(arc.proposed_completion), 'PP')
                  : null
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contractor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <KV label="Name" value={arc.contractor_name} />
            <KV label="License #" value={arc.contractor_license} />
          </CardContent>
        </Card>
      </div>

      {decided && arc.board_response ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Board response</CardTitle>
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

      {arc.status === 'withdrawn' ? null : (
        <Card variant="elevated">
          <CardHeader>
            <CardTitle className="text-base">
              {decided ? 'Update decision' : 'Decision'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ArcDecisionForm
              arcId={arc.id}
              currentResponse={arc.board_response}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function KV({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted">{label}</span>
      <span className="truncate text-right">
        {value == null || value === '' ? (
          <span className="text-muted">—</span>
        ) : (
          value
        )}
      </span>
    </div>
  )
}
