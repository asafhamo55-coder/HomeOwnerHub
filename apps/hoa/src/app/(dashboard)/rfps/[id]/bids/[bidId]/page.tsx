import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, FileText } from 'lucide-react'
import { format } from 'date-fns'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@homeowner-portal/ui'
import {
  getBid,
  getBidDocumentSignedUrl,
  type BidStatus,
} from '@/lib/bids'
import { AwardBidButton } from './AwardBidButton'

export const metadata = { title: 'Bid' }

const STATUS_VARIANT: Record<BidStatus, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  draft: 'outline',
  submitted: 'success',
  withdrawn: 'outline',
  declined: 'destructive',
  awarded: 'success',
}

export default async function BidDetailPage({
  params,
}: {
  params: Promise<{ id: string; bidId: string }>
}) {
  const { id: rfpId, bidId } = await params
  const bid = await getBid(bidId)
  if (!bid) notFound()

  const signedUrl = bid.raw_document_path
    ? await getBidDocumentSignedUrl(bid.raw_document_path)
    : null

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href={`/rfps/${rfpId}/bids`}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-fg hover:text-muted"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to bids
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-muted">{bid.vendor_legal_name}</h1>
          <p className="text-sm text-muted-fg">
            {bid.submitted_at
              ? `Submitted ${format(new Date(bid.submitted_at), 'PPp')}`
              : 'Draft'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_VARIANT[bid.status]}>{bid.status}</Badge>
          {bid.status === 'submitted' ? (
            <AwardBidButton rfpId={rfpId} bidId={bid.id} />
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pricing & terms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <KV
              label="Total amount"
              value={`$${bid.total_amount.toLocaleString()}`}
            />
            <KV label="Payment terms" value={bid.payment_terms} />
            <KV label="Warranty" value={bid.warranty} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <KV
              label="Earliest start"
              value={
                bid.start_date ? format(new Date(bid.start_date), 'PP') : null
              }
            />
            <KV
              label="Completion"
              value={
                bid.completion_date
                  ? format(new Date(bid.completion_date), 'PP')
                  : null
              }
            />
          </CardContent>
        </Card>
      </div>

      {signedUrl ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vendor proposal</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <a href={signedUrl} target="_blank" rel="noreferrer noopener">
                <FileText className="h-4 w-4" />
                Open uploaded document
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {bid.line_items.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Line items ({bid.line_items.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-fg">
                  <th className="pb-2">Description</th>
                  <th className="pb-2 text-right">Qty</th>
                  <th className="pb-2 text-right">Unit $</th>
                  <th className="pb-2 text-right">Line $</th>
                </tr>
              </thead>
              <tbody>
                {bid.line_items.map((li) => (
                  <tr key={li.id} className="border-t border-border">
                    <td className="py-2 pr-3">
                      {li.description}
                      {li.notes ? (
                        <span className="block text-xs text-muted-fg">{li.notes}</span>
                      ) : null}
                      {li.is_excluded ? (
                        <Badge variant="destructive" size="sm" className="ml-2">
                          excluded
                        </Badge>
                      ) : null}
                      {li.is_addition ? (
                        <Badge variant="warning" size="sm" className="ml-2">
                          addition
                        </Badge>
                      ) : null}
                    </td>
                    <td className="py-2 text-right">
                      {li.quantity ?? '—'}
                    </td>
                    <td className="py-2 text-right">
                      {li.unit_price != null ? `$${li.unit_price.toLocaleString()}` : '—'}
                    </td>
                    <td className="py-2 text-right">
                      {li.line_total != null ? `$${li.line_total.toLocaleString()}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function KV({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-fg">{label}</span>
      <span className="truncate text-right">
        {value == null || value === '' ? (
          <span className="text-muted-fg">—</span>
        ) : (
          value
        )}
      </span>
    </div>
  )
}
