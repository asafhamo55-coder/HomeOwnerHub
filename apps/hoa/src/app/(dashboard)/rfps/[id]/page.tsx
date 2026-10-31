import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileSpreadsheet, Sparkles } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  KeyValue,
  KeyValueList,
  Page,
  StatusBadge,
} from '@homeowner-portal/ui'
import { getRfp } from '@/lib/rfps'
import { RFP_STATUS_LABELS, RFP_STATUS_TONES } from '@/lib/status/vendors'
import { formatBudget } from '@/components/vendors/format'
import { getPrimaryAssociation } from '@/lib/vendors'
import {
  listInvitableVendors,
  listRfpInvitations,
} from '@/lib/rfp-invitations'
import { RfpEditForm } from './RfpEditForm'
import { PublishRfpButton } from './PublishRfpButton'
import { CancelRfpButton } from './CancelRfpButton'
import { InviteVendorsPanel } from './InviteVendorsPanel'
import { formatDateTime } from '@/lib/format-datetime'
import { usd } from '@/lib/money/format'

export const metadata = { title: 'RFP' }

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

  const budget = formatBudget(rfp.budget_min, rfp.budget_max)

  return (
    <Page
      title={rfp.title}
      meta={
        <>
          <StatusBadge status={rfp.status} tones={RFP_STATUS_TONES} labels={RFP_STATUS_LABELS} />
          {rfp.ai_generated ? (
            <Badge variant="ai" icon={<Sparkles aria-hidden />}>
              AI draft
            </Badge>
          ) : null}
        </>
      }
      description={
        <span className="num">
          Bids due {formatDateTime(rfp.submission_deadline)}
          {budget ? ` · Budget ${budget}` : ''}
        </span>
      }
      breadcrumbs={[{ label: 'RFPs', href: '/rfps' }, { label: rfp.rfp_number }]}
      linkAs={Link}
      actions={
        <>
          {isCancellable ? <CancelRfpButton rfpId={rfp.id} /> : null}
          {isDraft ? <PublishRfpButton rfpId={rfp.id} /> : null}
          {rfp.status !== 'draft' ? (
            <Button asChild icon={<FileSpreadsheet aria-hidden />}>
              <Link href={`/rfps/${rfp.id}/bids`}>View bids</Link>
            </Button>
          ) : null}
        </>
      }
    >
      {isDraft ? (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle as="h2">Edit draft</CardTitle>
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
          <CardHeader className="pb-3">
            <CardTitle as="h2">Scope</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{rfp.scope}</p>
          </CardContent>
        </Card>
      )}

      {isOpen ? (
        <InviteVendorsPanel rfpId={rfp.id} invitableVendors={invitableVendors} invitations={invitations} />
      ) : null}

      {rfp.line_items.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle as="h2">Line items</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-border border-t border-border">
            {rfp.line_items.map((li) => (
              <li key={li.id} className="flex items-start justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{li.description}</p>
                  {li.notes ? <p className="mt-0.5 text-xs text-muted">{li.notes}</p> : null}
                </div>
                {li.quantity != null || li.unit ? (
                  <span className="num shrink-0 text-sm text-foreground-secondary">
                    {li.quantity != null ? li.quantity : ''}
                    {li.unit ? ` ${li.unit}` : ''}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        {rfp.evaluation_criteria && rfp.evaluation_criteria.length > 0 ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle as="h2">Evaluation criteria</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm">
                {rfp.evaluation_criteria.map((c, i) => (
                  <li key={`${c.criterion}-${i}`} className="space-y-1">
                    <div className="flex justify-between gap-3">
                      <span className="text-foreground">{c.criterion}</span>
                      <span className="num text-foreground-secondary">{c.weight}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden>
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, c.weight)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {insurance.length > 0 ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle as="h2">Insurance requirements</CardTitle>
            </CardHeader>
            <CardContent>
              <KeyValueList>
                {insurance.map(([k, v]) => (
                  <KeyValue key={k} label={humanizeKey(k)} value={formatInsuranceValue(v)} />
                ))}
              </KeyValueList>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </Page>
  )
}

function humanizeKey(k: string): string {
  const s = k.replace(/_/g, ' ').replace(/\bgl\b/i, 'GL').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatInsuranceValue(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'number') return usd(v, { whole: Number.isInteger(v) })
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}
