import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Inbox, Sparkles } from 'lucide-react'
import {
  Button,
  DataTable,
  EmptyState,
  LoadFailed,
  Page,
  StatusBadge,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { getRfp } from '@/lib/rfps'
import { listBidsForRfpResult, type BidRow } from '@/lib/bids'
import { BID_STATUS_LABELS, BID_STATUS_TONES } from '@/lib/status/vendors'
import { shortDate, usd } from '@/components/vendors/format'
import { RunComparisonButton } from './RunComparisonButton'

export const metadata = { title: 'Bids' }

export default async function BidsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: rfpId } = await params
  const rfp = await getRfp(rfpId)
  if (!rfp) notFound()

  const result = await listBidsForRfpResult(rfpId)
  const bids = result.ok ? result.data : []
  const submittedCount = bids.filter((b) => b.status === 'submitted').length
  const canCompare = submittedCount >= 2 && rfp.status !== 'cancelled'

  const columns: DataTableColumn<BidRow>[] = [
    {
      key: 'vendor',
      header: 'Vendor',
      mobilePrimary: true,
      cell: (b) => (
        <Link
          href={`/rfps/${rfpId}/bids/${b.id}`}
          className="font-medium text-foreground hover:text-primary hover:underline"
        >
          {b.vendor_legal_name}
        </Link>
      ),
    },
    {
      key: 'amount',
      header: 'Total',
      numeric: true,
      cell: (b) => <span className="font-semibold">{usd(b.total_amount)}</span>,
    },
    { key: 'terms', header: 'Payment terms', hideBelowLg: true, cell: (b) => b.payment_terms ?? '—' },
    { key: 'warranty', header: 'Warranty', hideBelowLg: true, cell: (b) => b.warranty ?? '—' },
    {
      key: 'submitted',
      header: 'Submitted',
      cell: (b) => <span className="num">{shortDate(b.submitted_at) ?? 'Not submitted'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (b) => <StatusBadge status={b.status} tones={BID_STATUS_TONES} labels={BID_STATUS_LABELS} />,
    },
  ]

  return (
    <Page
      title="Bids"
      description={
        result.ok ? (
          <span className="num">
            {rfp.title} · {bids.length} {bids.length === 1 ? 'bid' : 'bids'}, {submittedCount} submitted
            {submittedCount < 2 ? ' · comparison needs at least 2 submitted bids' : ''}
          </span>
        ) : (
          rfp.title
        )
      }
      breadcrumbs={[
        { label: 'RFPs', href: '/rfps' },
        { label: rfp.rfp_number, href: `/rfps/${rfpId}` },
        { label: 'Bids' },
      ]}
      linkAs={Link}
      actions={
        <>
          {submittedCount >= 2 ? (
            <Button asChild variant="secondary" icon={<Sparkles aria-hidden />}>
              <Link href={`/rfps/${rfpId}/comparison`}>View comparison</Link>
            </Button>
          ) : null}
          {canCompare ? <RunComparisonButton rfpId={rfpId} /> : null}
        </>
      }
    >
      {!result.ok ? (
        <LoadFailed what="bids" retryHref={`/rfps/${rfpId}/bids`} />
      ) : (
        <DataTable
          columns={columns}
          rows={bids}
          rowKey={(b) => b.id}
          mobile="cards"
          linkAs={Link}
          caption={`Bids on ${rfp.rfp_number}`}
          empty={
            <EmptyState
              variant="compact"
              icon={<Inbox aria-hidden />}
              title="No bids yet"
              description="Invite vendors from the RFP page. Their submissions appear here."
              action={
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/rfps/${rfpId}`}>Open the RFP</Link>
                </Button>
              }
            />
          }
        />
      )}
    </Page>
  )
}
