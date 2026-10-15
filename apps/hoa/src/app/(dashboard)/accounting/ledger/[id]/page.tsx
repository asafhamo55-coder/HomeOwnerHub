import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import {
  Alert,
  Card,
  CardContent,
  KeyValue,
  KeyValueList,
  Page,
  StatementTable,
  StatusPill,
} from '@homeowner-portal/ui'
import { getAccountingContext, getJournalEntry } from '@/lib/accounting/queries'
import { tryLoad } from '@/lib/load-or-fail'
import { formatDay, formatStamp, usd } from '@/lib/money/format'
import { JOURNAL_STATUS, sourceLabel, statusOf } from '@/lib/money/status'
import { AccountLabel, AccountingLoadFailed, accountingCrumbs } from '../../_components/shared'
import { ReverseEntryButton } from './ReverseEntryButton'
import { PromoteRecurringButton } from './PromoteRecurringButton'

export const metadata = { title: 'Journal Entry' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function JournalEntryDetailPage({ params }: PageProps) {
  const { id } = await params
  const crumbs = accountingCrumbs(['Ledger', '/accounting/ledger'], ['Journal entry'])
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Journal entry" what="this journal entry" breadcrumbs={crumbs} />
  const ctx = ctxRes.data
  if (!ctx) notFound()

  const res = await tryLoad('journal entry', () => getJournalEntry(ctx.associationId, id))
  if (!res.ok) return <AccountingLoadFailed title="Journal entry" what="this journal entry" breadcrumbs={crumbs} />
  const je = res.data
  if (!je) notFound()

  const { header } = je
  const totalDr = je.lines.reduce((s, l) => s + l.debit_amount, 0)
  const totalCr = je.lines.reduce((s, l) => s + l.credit_amount, 0)
  // Compared to the cent: summing numeric(14,2) values as JS floats can
  // leave dust (0.1 + 0.2), which made `===` report "off by $0.00".
  const isBalanced = Math.abs(totalDr - totalCr) < 0.005
  const status = statusOf(JOURNAL_STATUS, header.status)
  const canAct = header.status === 'posted' && !header.reversed_by_id

  return (
    <Page
      width="default"
      linkAs={Link}
      breadcrumbs={accountingCrumbs(['Ledger', '/accounting/ledger'], [header.entry_number])}
      title={header.memo}
      eyebrow={<span className="num">{header.entry_number}</span>}
      meta={
        <>
          <StatusPill tone={status.tone} label={status.label} />
          {header.ai_generated ? <StatusPill tone="ai" label="Drafted by AI" icon={<Sparkles aria-hidden />} /> : null}
        </>
      }
      actions={
        canAct ? (
          <>
            <PromoteRecurringButton journalEntryId={header.id} />
            <ReverseEntryButton journalEntryId={header.id} entryNumber={header.entry_number} />
          </>
        ) : undefined
      }
    >
      {header.reverses_id ? (
        <Alert variant="info" title="This is a reversing entry">
          It cancels{' '}
          <Link href={`/accounting/ledger/${header.reverses_id}`} className="font-medium text-primary underline">
            the original entry
          </Link>
          .
        </Alert>
      ) : null}
      {header.reversed_by_id ? (
        <Alert variant="warning" title="Reversed">
          This entry no longer counts toward any balance —{' '}
          <Link href={`/accounting/ledger/${header.reversed_by_id}`} className="font-medium text-primary underline">
            see the reversing entry
          </Link>
          .
        </Alert>
      ) : null}
      {header.status === 'draft' ? (
        <Alert variant="info" title="Draft">
          Not on the books yet — drafts don’t appear in balances or reports.
        </Alert>
      ) : null}

      <Card>
        <CardContent className="pt-5">
          <KeyValueList>
            <KeyValue label="Entry date" value={formatDay(header.entry_date)} />
            <KeyValue label="Source" value={sourceLabel(header.source)} />
            <KeyValue label="Posted" value={header.posted_at ? formatStamp(header.posted_at) : 'Not posted'} />
            <KeyValue label="Amount" value={<span className="num">{usd(totalDr)}</span>} />
          </KeyValueList>
        </CardContent>
      </Card>

      <section aria-labelledby="je-lines" className="space-y-3">
        <h2 id="je-lines" className="text-lg font-semibold text-foreground">
          Lines
        </h2>
        <StatementTable
          caption={`Lines of ${header.entry_number}`}
          columns={[
            { key: 'debit', header: 'Debit' },
            { key: 'credit', header: 'Credit' },
          ]}
          sections={[
            {
              key: 'lines',
              empty: 'This entry has no lines.',
              rows: je.lines.map((l) => ({
                key: l.id,
                label: <AccountLabel number={l.account.account_number} name={l.account.account_name} />,
                detail: (
                  <span className="pl-[2.875rem]">
                    {l.fund.name}
                    {l.memo ? ` · ${l.memo}` : ''}
                  </span>
                ),
                values: {
                  debit: l.debit_amount > 0 ? usd(l.debit_amount) : <span className="text-muted">—</span>,
                  credit: l.credit_amount > 0 ? usd(l.credit_amount) : <span className="text-muted">—</span>,
                },
              })),
            },
          ]}
          totals={[
            {
              key: 'total',
              label: (
                <span className="flex flex-wrap items-center gap-2">
                  Total
                  {isBalanced ? (
                    <StatusPill tone="success" label="Balanced" size="sm" />
                  ) : (
                    <StatusPill tone="danger" label={`Off by ${usd(Math.abs(totalDr - totalCr))}`} size="sm" />
                  )}
                </span>
              ),
              values: { debit: usd(totalDr), credit: usd(totalCr) },
            },
          ]}
        />
      </section>

    </Page>
  )
}
