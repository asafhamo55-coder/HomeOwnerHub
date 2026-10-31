import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  LoadFailed,
  Page,
  StatusPill,
  TableScroll,
  type StatusTone,
} from '@homeowner-portal/ui'
import { getRfp } from '@/lib/rfps'
import { listBidsForRfpResult, getLatestBidComparison } from '@/lib/bids'
import { tryLoad } from '@/lib/load-or-fail'
import { COMPARISON_CELL_LABELS, COMPARISON_CELL_TONES } from '@/lib/status/vendors'
import { usd } from '@/components/vendors/format'
import { formatDateTime } from '@/lib/format-datetime'

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

export default async function ComparisonPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: rfpId } = await params
  const [rfp, comparisonResult, bidsResult] = await Promise.all([
    getRfp(rfpId),
    tryLoad('bid comparison', () => getLatestBidComparison(rfpId)),
    listBidsForRfpResult(rfpId),
  ])
  if (!rfp) notFound()

  const bids = bidsResult.ok ? bidsResult.data : []
  const bidNameById = new Map(bids.map((b) => [b.id, b.vendor_legal_name]))
  const comparison = comparisonResult.ok ? comparisonResult.data : null

  return (
    <Page
      width="wide"
      title="Bid comparison"
      description={rfp.title}
      breadcrumbs={[
        { label: 'RFPs', href: '/rfps' },
        { label: rfp.rfp_number, href: `/rfps/${rfpId}` },
        { label: 'Bids', href: `/rfps/${rfpId}/bids` },
        { label: 'Comparison' },
      ]}
      linkAs={Link}
    >
      {!comparisonResult.ok || !bidsResult.ok ? (
        <LoadFailed what="the bid comparison" retryHref={`/rfps/${rfpId}/comparison`} />
      ) : !comparison ? (
        <EmptyState
          icon={<Sparkles aria-hidden />}
          title="No comparison yet"
          description="Once at least two bids are submitted, run a comparison from the bids page."
          action={
            <Button asChild variant="secondary">
              <Link href={`/rfps/${rfpId}/bids`}>Go to bids</Link>
            </Button>
          }
        />
      ) : (
        <>
          {comparison.recommendation_memo ? (
            <Card>
              <CardHeader
                className="pb-3"
                actions={
                  <Badge variant="ai" icon={<Sparkles aria-hidden />}>
                    AI draft
                  </Badge>
                }
              >
                <CardTitle as="h2">Recommendation memo</CardTitle>
                <CardDescription>
                  Generated {formatDateTime(comparison.generated_at)}. A draft for discussion — the
                  board makes the decision.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {comparison.recommendation_memo}
                </p>
              </CardContent>
            </Card>
          ) : null}

          <section className="space-y-3" aria-labelledby="line-compare">
            <h2 id="line-compare" className="text-lg font-semibold text-foreground">
              Line-item comparison
            </h2>
            <ComparisonTable rows={comparison.comparison_table as ComparisonRow[]} bids={bids} />
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <FlagsCard
              title="Flagged exclusions"
              items={comparison.flagged_exclusions as FlaggedItem[]}
              bidNameById={bidNameById}
              tone="danger"
            />
            <FlagsCard
              title="Flagged additions"
              items={comparison.flagged_additions as FlaggedItem[]}
              bidNameById={bidNameById}
              tone="warning"
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
    </Page>
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
    return <p className="text-sm text-muted">The comparison didn’t align any line items.</p>
  }
  // Build the header from the first row's bids — assumes the LLM
  // returned the bids in a consistent order across rows (it does per
  // the prompt contract).
  const headerBids = rows[0]?.bids ?? bids.map((b) => ({ bidId: b.id, vendorName: b.vendor_legal_name }))

  return (
    <TableScroll className="rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">Line-item comparison across bids</caption>
        <thead className="bg-subtle">
          <tr className="text-left text-xs font-medium text-muted">
            <th scope="col" className="sticky left-0 bg-subtle px-4 py-2.5">
              RFP line
            </th>
            {headerBids.map((b) => (
              <th key={b.bidId} scope="col" className="px-4 py-2.5 text-right">
                {b.vendorName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.rfpDescription}-${i}`} className="border-t border-border align-top">
              <th scope="row" className="sticky left-0 bg-surface px-4 py-3 text-left font-normal text-foreground">
                {row.rfpDescription}
              </th>
              {row.bids.map((b) => (
                <td key={b.bidId} className="px-4 py-3 text-right">
                  <div className="flex flex-col items-end gap-1">
                    {b.amount != null ? (
                      <span className="num font-medium text-foreground">{usd(b.amount)}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                    {b.status !== 'matched' ? (
                      <StatusPill tone={COMPARISON_CELL_TONES[b.status]} label={COMPARISON_CELL_LABELS[b.status]} />
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
    </TableScroll>
  )
}

function FlagsCard({
  title,
  items,
  bidNameById,
  tone,
}: {
  title: string
  items: FlaggedItem[]
  bidNameById: Map<string, string>
  tone: StatusTone
}) {
  return (
    <Card>
      <CardHeader
        className="pb-3"
        actions={
          <Badge variant="neutral" className="num">
            {items?.length ?? 0}
          </Badge>
        }
      >
        <CardTitle as="h2">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {!items || items.length === 0 ? (
          <p className="text-sm text-muted">None.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((f, i) => (
              <li key={`${f.bidId}-${i}`} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={tone} label={bidNameById.get(f.bidId) ?? 'Unknown vendor'} />
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
      <CardHeader className="pb-3">
        <CardTitle as="h2">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {!items || items.length === 0 ? (
          <p className="text-sm text-muted">No summary.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((p, i) => (
              <li key={`${p.bidId}-${i}`} className="text-sm">
                <span className="font-medium text-foreground">
                  {bidNameById.get(p.bidId) ?? 'Unknown vendor'}:
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
