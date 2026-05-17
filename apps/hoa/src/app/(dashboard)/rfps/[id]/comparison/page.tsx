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
  EmptyState,
} from '@homeowner-portal/ui'
import { getRfp } from '@/lib/rfps'
import { listBidsForRfp, getLatestBidComparison } from '@/lib/bids'

export const metadata = { title: 'Bid comparison' }

interface ComparisonBidCell {
  bidId: string
  vendorName: string
  matchedDescription: string | null
  amount: number | null
  status: 'matched' | 'excluded' | 'addition'
}

interface ComparisonRow {
  rfpLineItemId: string | null
  rfpDescription: string
  bids: ComparisonBidCell[]
}

interface FlaggedItem {
  bidId: string
  line: string
  detail: string
}

interface PerBidSummary {
  bidId: string
  summary: string
}

const STATUS_VARIANT: Record<ComparisonBidCell['status'], 'success' | 'warning' | 'destructive'> = {
  matched: 'success',
  excluded: 'destructive',
  addition: 'warning',
}

export default async function ComparisonPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: rfpId } = await params
  const [rfp, comparison, bids] = await Promise.all([
    getRfp(rfpId),
    getLatestBidComparison(rfpId),
    listBidsForRfp(rfpId),
  ])
  if (!rfp) notFound()

  const bidNameById = new Map(bids.map((b) => [b.id, b.vendor_legal_name]))

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link
        href={`/rfps/${rfpId}/bids`}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to bids
      </Link>

      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Bid comparison</h1>
        </div>
        <p className="text-sm text-muted">
          {rfp.rfp_number} · {rfp.title}
        </p>
      </header>

      {!comparison ? (
        <EmptyState
          icon={<Sparkles className="h-10 w-10" aria-hidden />}
          title="No comparison run yet"
          description="From the bids page, click 'Run W23 comparison' once at least two bids are submitted."
        />
      ) : (
        <>
          <p className="text-xs text-muted">
            Generated {format(new Date(comparison.generated_at), 'PPpp')}
          </p>

          {comparison.recommendation_memo ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recommendation memo</CardTitle>
                <p className="text-xs text-muted">
                  Drafted by W23. The board decides — not the workflow.
                </p>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {comparison.recommendation_memo}
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Line-item comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <ComparisonTable rows={comparison.comparison_table as ComparisonRow[]} bids={bids} />
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <FlagsCard
              title="Flagged exclusions"
              items={comparison.flagged_exclusions as FlaggedItem[]}
              bidNameById={bidNameById}
              variant="destructive"
            />
            <FlagsCard
              title="Flagged additions"
              items={comparison.flagged_additions as FlaggedItem[]}
              bidNameById={bidNameById}
              variant="warning"
            />
            <SummaryCard
              title="Payment terms"
              items={comparison.payment_term_diffs as PerBidSummary[]}
              bidNameById={bidNameById}
            />
            <SummaryCard
              title="Warranty"
              items={comparison.warranty_diffs as PerBidSummary[]}
              bidNameById={bidNameById}
            />
          </div>
        </>
      )}
    </div>
  )
}

function ComparisonTable({
  rows,
  bids,
}: {
  rows: ComparisonRow[]
  bids: Array<{ id: string; vendor_legal_name: string }>
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">No line items aligned.</p>
  }
  // Build the header from the first row's bids — assumes the LLM
  // returned the bids in a consistent order across rows (it does per
  // the prompt contract).
  const headerBids = rows[0]?.bids ?? bids.map((b) => ({ bidId: b.id, vendorName: b.vendor_legal_name }))

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="pb-2 pr-3">RFP line</th>
            {headerBids.map((b) => (
              <th key={b.bidId} className="pb-2 pr-3 text-right">
                {b.vendorName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.rfpDescription}-${i}`} className="border-t border-border align-top">
              <td className="py-2 pr-3 text-foreground">{row.rfpDescription}</td>
              {row.bids.map((b) => (
                <td key={b.bidId} className="py-2 pr-3 text-right">
                  <div className="flex flex-col items-end gap-1">
                    {b.amount != null ? (
                      <span className="font-medium text-foreground">
                        ${b.amount.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                    {b.status !== 'matched' ? (
                      <Badge variant={STATUS_VARIANT[b.status]} size="sm">
                        {b.status}
                      </Badge>
                    ) : null}
                    {b.matchedDescription &&
                    b.matchedDescription.toLowerCase() !== row.rfpDescription.toLowerCase() ? (
                      <span className="text-xs text-muted">
                        {b.matchedDescription}
                      </span>
                    ) : null}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FlagsCard({
  title,
  items,
  bidNameById,
  variant,
}: {
  title: string
  items: FlaggedItem[]
  bidNameById: Map<string, string>
  variant: 'destructive' | 'warning'
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {title} ({items?.length ?? 0})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!items || items.length === 0 ? (
          <p className="text-sm text-muted">None.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((f, i) => (
              <li
                key={`${f.bidId}-${i}`}
                className="rounded-md border border-border bg-foreground/10 p-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Badge variant={variant} size="sm">
                    {bidNameById.get(f.bidId) ?? f.bidId.slice(0, 8)}
                  </Badge>
                  <span className="text-xs text-muted">{f.line}</span>
                </div>
                <p className="mt-1 text-foreground">{f.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function SummaryCard({
  title,
  items,
  bidNameById,
}: {
  title: string
  items: PerBidSummary[]
  bidNameById: Map<string, string>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {!items || items.length === 0 ? (
          <p className="text-sm text-muted">No summary.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((p, i) => (
              <li key={`${p.bidId}-${i}`} className="text-sm">
                <span className="text-xs font-semibold text-foreground">
                  {bidNameById.get(p.bidId) ?? p.bidId.slice(0, 8)}:
                </span>{' '}
                <span className="text-foreground">{p.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
