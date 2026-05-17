import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileSpreadsheet, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import {
  BackLink,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  KeyValue,
  KeyValueList,
  PageHeader,
} from '@homeowner-portal/ui'
import { getRfp, type RfpStatus } from '@/lib/rfps'
import { getPrimaryAssociation } from '@/lib/vendors'
import {
  listInvitableVendors,
  listRfpInvitations,
} from '@/lib/rfp-invitations'
import { RfpEditForm } from './RfpEditForm'
import { PublishRfpButton } from './PublishRfpButton'
import { CancelRfpButton } from './CancelRfpButton'
import { InviteVendorsPanel } from './InviteVendorsPanel'

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
  const isOpen = rfp.status === 'open'
  const isCancellable = rfp.status === 'draft' || rfp.status === 'open'

  const insurance = rfp.insurance_requirements
    ? Object.entries(rfp.insurance_requirements)
    : []

  const association = isOpen ? await getPrimaryAssociation() : null
  const [invitableVendors, invitations] = isOpen && association
    ? await Promise.all([
        listInvitableVendors(rfp.id, association.id),
        listRfpInvitations(rfp.id),
      ])
    : [[], []]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <BackLink href="/rfps" label="All RFPs" />

      <PageHeader
        title={
          <>
            <span className="block font-mono text-xs font-normal text-muted">
              {rfp.rfp_number}
            </span>
            {rfp.title}
          </>
        }
        description={
          <>
            Deadline {format(new Date(rfp.submission_deadline), 'PPp')}
            {rfp.budget_min || rfp.budget_max ? (
              <> · {formatBudget(rfp.budget_min, rfp.budget_max)}</>
            ) : null}
          </>
        }
        actions={
          <>
            {rfp.ai_generated ? (
              <Badge variant="outline">
                <Sparkles className="mr-1 h-3 w-3" />
                AI draft
              </Badge>
            ) : null}
            <Badge variant={STATUS_VARIANT[rfp.status]}>{rfp.status}</Badge>
            {rfp.status !== 'draft' ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/rfps/${rfp.id}/bids`}>
                  <FileSpreadsheet className="h-4 w-4" />
                  View bids
                </Link>
              </Button>
            ) : null}
            {isDraft ? <PublishRfpButton rfpId={rfp.id} /> : null}
            {isCancellable ? <CancelRfpButton rfpId={rfp.id} /> : null}
          </>
        }
      />

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
            <p className="whitespace-pre-wrap text-sm text-foreground">{rfp.scope}</p>
          </CardContent>
        </Card>
      )}

      {isOpen ? (
        <InviteVendorsPanel
          rfpId={rfp.id}
          invitableVendors={invitableVendors}
          invitations={invitations}
        />
      ) : null}

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
                <li key={li.id} className="rounded-md border border-border bg-foreground/10 p-3">
                  <p className="text-sm text-foreground">{li.description}</p>
                  {li.quantity != null || li.unit || li.notes ? (
                    <p className="mt-1 text-xs text-muted">
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
                    <span className="text-foreground">{c.criterion}</span>
                    <span className="font-mono text-xs text-muted">
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
              <KeyValueList>
                {insurance.map(([k, v]) => (
                  <KeyValue key={k} label={k} value={formatInsuranceValue(v)} />
                ))}
              </KeyValueList>
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
