import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileText } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  KeyValue,
  KeyValueList,
  Page,
  StatusBadge,
  StatusPill,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { getBid, getBidDocumentSignedUrl, type BidLineItemRow } from '@/lib/bids'
import { BID_STATUS_LABELS, BID_STATUS_TONES } from '@/lib/status/vendors'
import { dateOnly, usd } from '@/components/vendors/format'
import { AwardBidButton } from './AwardBidButton'
import { ConflictDisclosurePanel } from '@/components/conflict-disclosure/ConflictDisclosurePanel'
import { formatDateTime } from '@/lib/format-datetime'

export const metadata = { title: 'Bid' }

const lineColumns: DataTableColumn<BidLineItemRow>[] = [
  {
    key: 'description',
    header: 'Description',
    mobilePrimary: true,
    cell: (li) => (
      <div className="min-w-0 space-y-1">
        <p className="text-foreground">{li.description}</p>
        {li.notes ? <p className="text-xs text-muted">{li.notes}</p> : null}
        {li.is_excluded || li.is_addition ? (
          <div className="flex flex-wrap gap-1">
            {li.is_excluded ? <StatusPill tone="danger" label="Excluded" /> : null}
            {li.is_addition ? <StatusPill tone="warning" label="Addition" /> : null}
          </div>
        ) : null}
      </div>
    ),
  },
  { key: 'qty', header: 'Qty', numeric: true, cell: (li) => li.quantity ?? '—' },
  { key: 'unit', header: 'Unit price', numeric: true, cell: (li) => usd(li.unit_price) ?? '—' },
  {
    key: 'total',
    header: 'Line total',
    numeric: true,
    cell: (li) => <span className="font-medium">{usd(li.line_total) ?? '—'}</span>,
  },
]

export default async function BidDetailPage({
  params,
}: {
  params: Promise<{ id: string; bidId: string }>
}) {
  const { id: rfpId, bidId } = await params
  const bid = await getBid(bidId)
  if (!bid) notFound()

  const signedUrl = bid.raw_document_path ? await getBidDocumentSignedUrl(bid.raw_document_path) : null

  return (
    <Page
      title={bid.vendor_legal_name}
      meta={<StatusBadge status={bid.status} tones={BID_STATUS_TONES} labels={BID_STATUS_LABELS} />}
      description={
        bid.submitted_at ? `Submitted ${formatDateTime(bid.submitted_at)}` : 'Not submitted yet'
      }
      breadcrumbs={[
        { label: 'RFPs', href: '/rfps' },
        { label: 'Bids', href: `/rfps/${rfpId}/bids` },
        { label: bid.vendor_legal_name },
      ]}
      linkAs={Link}
      actions={
        <>
          {signedUrl ? (
            <Button asChild variant="secondary" icon={<FileText aria-hidden />}>
              <a href={signedUrl} target="_blank" rel="noreferrer noopener">
                Open proposal
              </a>
            </Button>
          ) : null}
          {bid.status === 'submitted' ? <AwardBidButton rfpId={rfpId} bidId={bid.id} /> : null}
        </>
      }
    >
      {bid.status === 'submitted' || bid.status === 'awarded' ? (
        <ConflictDisclosurePanel decisionKind="bid_award" decisionId={bid.id} />
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle as="h2">Pricing and terms</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValueList>
              <KeyValue label="Total" value={<span className="num font-semibold">{usd(bid.total_amount)}</span>} />
              <KeyValue label="Payment terms" value={bid.payment_terms ?? '—'} />
              <KeyValue label="Warranty" value={bid.warranty ?? '—'} />
            </KeyValueList>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle as="h2">Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValueList>
              <KeyValue label="Earliest start" value={dateOnly(bid.start_date) ?? '—'} />
              <KeyValue label="Completion" value={dateOnly(bid.completion_date) ?? '—'} />
            </KeyValueList>
          </CardContent>
        </Card>
      </div>

      {bid.line_items.length > 0 ? (
        <section className="space-y-3" aria-labelledby="line-items">
          <h2 id="line-items" className="text-lg font-semibold text-foreground">
            Line items
          </h2>
          <DataTable
            columns={lineColumns}
            rows={bid.line_items}
            rowKey={(li) => li.id}
            caption="Bid line items"
            mobile="cards"
          />
        </section>
      ) : null}
    </Page>
  )
}
