import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@homeowner-portal/ui'
import { getRfp, type RfpStatus } from '@/lib/rfps'
import { RfpEditForm } from './RfpEditForm'
import { PublishRfpButton } from './PublishRfpButton'
import { CancelRfpButton } from './CancelRfpButton'

export const metadata = { title: 'RFP' }

const STATUS_VARIANT: Record<RfpStatus, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  draft: 'outline',
  open: 'success',
  evaluation: 'warning',
  awarded: 'success',
  cancelled: 'destructive',
}

export default async function RfpDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const rfp = await getRfp(id)
  if (!rfp) notFound()

  const isDraft = rfp.status === 'draft'
  const isCancellable = rfp.status === 'draft' || rfp.status === 'open'

  const insurance = rfp.insurance_requirements
    ? Object.entries(rfp.insurance_requirements)
    : []

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/rfps"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-fg hover:text-muted"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to RFPs
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted-fg">{rfp.rfp_number}</p>
          <h1 className="text-2xl font-bold text-muted">{rfp.title}</h1>
          <p className="mt-1 text-xs text-muted-fg">
            Deadline {format(new Date(rfp.submission_deadline), 'PPp')}
            {rfp.budget_min || rfp.budget_max ? (
              <> · {formatBudget(rfp.budget_min, rfp.budget_max)}</>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rfp.ai_generated ? (
            <Badge variant="outline">
              <Sparkles className="mr-1 h-3 w-3" />
              AI draft
            </Badge>
          ) : null}
          <Badge variant={STATUS_VARIANT[rfp.status]}>{rfp.status}</Badge>
          {isDraft ? <PublishRfpButton rfpId={rfp.id} /> : null}
          {isCancellable ? <CancelRfpButton rfpId={rfp.id} /> : null}
        </div>
      </header>

      {isDraft ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Edit draft</CardTitle>
          </CardHeader>
          <CardContent>
            <RfpEditForm
              rfpId={rfp.id}
              initialTitle={rfp.title}
              initialScope={rfp.scope}
              initialBudgetMin={rfp.budget_min}
              initialBudgetMax={rfp.budget_max}
              initialSubmissionDeadline={rfp.submission_deadline}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scope</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted">{rfp.scope}</p>
          </CardContent>
        </Card>
      )}

      {rfp.line_items.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Line items ({rfp.line_items.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {rfp.line_items.map((li) => (
                <li key={li.id} className="rounded-md border border-border bg-muted/10 p-3">
                  <p className="text-sm text-muted">{li.description}</p>
                  {li.quantity != null || li.unit || li.notes ? (
                    <p className="mt-1 text-xs text-muted-fg">
                      {li.quantity != null ? `${li.quantity}` : ''}
                      {li.unit ? ` ${li.unit}` : ''}
                      {(li.quantity != null || li.unit) && li.notes ? ' · ' : ''}
                      {li.notes ?? ''}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {rfp.evaluation_criteria && rfp.evaluation_criteria.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Evaluation criteria</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {rfp.evaluation_criteria.map((c, i) => (
                  <li key={`${c.criterion}-${i}`} className="flex justify-between gap-3">
                    <span className="text-muted">{c.criterion}</span>
                    <span className="font-mono text-xs text-muted-fg">
                      {c.weight}%
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {insurance.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Insurance requirements</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {insurance.map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-3">
                    <span className="text-muted-fg">{k}</span>
                    <span className="truncate text-right text-muted">
                      {formatInsuranceValue(v)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

function formatBudget(min: number | null, max: number | null): string {
  if (min && max) return `$${min.toLocaleString()}–$${max.toLocaleString()}`
  if (max) return `up to $${max.toLocaleString()}`
  if (min) return `from $${min.toLocaleString()}`
  return ''
}

function formatInsuranceValue(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'number') return `$${v.toLocaleString()}`
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}
