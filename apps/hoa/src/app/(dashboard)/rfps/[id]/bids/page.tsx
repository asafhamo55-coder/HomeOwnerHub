import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
} from '@homeowner-portal/ui'
import { getRfp } from '@/lib/rfps'
import { listBidsForRfp, type BidStatus } from '@/lib/bids'
import { RunComparisonButton } from './RunComparisonButton'

export const metadata = { title: 'Bids' }

const STATUS_VARIANT: Record<BidStatus, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  draft: 'outline',
  submitted: 'success',
  withdrawn: 'outline',
  declined: 'destructive',
  awarded: 'success',
}

export default async function BidsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: rfpId } = await params
  const rfp = await getRfp(rfpId)
  if (!rfp) notFound()

  const bids = await listBidsForRfp(rfpId)
  const submittedCount = bids.filter((b) => b.status === 'submitted').length
  const canCompare = submittedCount >= 2 && rfp.status !== 'cancelled'

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href={`/rfps/${rfpId}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to RFP
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted">{rfp.rfp_number}</p>
          <h1 className="text-2xl font-bold text-foreground">
            Bids on {rfp.title}
          </h1>
          <p className="text-sm text-muted">
            {bids.length} bid{bids.length === 1 ? '' : 's'} ·{' '}
            {submittedCount} submitted
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCompare ? (
            <RunComparisonButton rfpId={rfpId} />
          ) : null}
          {submittedCount >= 2 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/rfps/${rfpId}/comparison`}>
                <Sparkles className="h-4 w-4" />
                View comparison
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      {bids.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="h-10 w-10" aria-hidden />}
          title="No bids submitted yet"
          description="Invite vendors from the RFP page; they'll submit via a tokenized link. Submissions appear here."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {bids.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/rfps/${rfpId}/bids/${b.id}`}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-background/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {b.vendor_legal_name}
                    </p>
                    <p className="text-xs text-muted">
                      {b.submitted_at
                        ? `Submitted ${format(new Date(b.submitted_at), 'PP')}`
                        : 'Draft (not submitted)'}
                      {b.payment_terms ? ` · ${b.payment_terms}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1">
                    <span className="text-lg font-semibold text-foreground">
                      ${b.total_amount.toLocaleString()}
                    </span>
                    <Badge variant={STATUS_VARIANT[b.status]} size="sm">
                      {b.status}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
