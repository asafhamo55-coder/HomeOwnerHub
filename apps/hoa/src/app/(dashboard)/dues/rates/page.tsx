import Link from 'next/link'
import { BadgeDollarSign } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  LoadFailed,
  Page,
  StatusPill,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { M5_APPLIED } from '@homeowner-portal/db/m5'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'
import { todayIn } from '@/lib/association-time'
import { loadOrFail, tryLoad } from '@/lib/load-or-fail'
import { formatDay } from '@/lib/money/format'
import { getAccountingContext } from '@/lib/accounting/queries'
import { loadBudgetNoticeInput } from '@/lib/budget-notice/load'
import { perHomeOf } from '@/lib/budget-notice/model'
import {
  annualCents,
  centsLabel,
  pctPhrase,
  rateChange,
  rateInEffect,
  rateLabel,
  suggestFromBudget,
  upcomingRate,
  type BudgetSuggestion,
  type DuesRate,
} from '@/lib/dues-rates/model'
import { NOT_LEGAL_ADVICE, rateChangeRules } from '@/lib/dues-rates/law'
import { buildRateNotice } from '@/lib/dues-rates/notice'
import { loadDuesRates, type LooseDb } from '@/lib/dues-rates/queries'
import { AddRateForm } from './AddRateForm'
import { DeleteRateButton } from './DeleteRateButton'
import { DraftRateNoticeButton } from './DraftRateNoticeButton'

export const metadata = { title: 'Dues rates' }
export const dynamic = 'force-dynamic'

const DESCRIPTION =
  'What each home pays in dues, and from when. Generate dues and Add a due start from the rate in effect; a different amount is recorded in the activity log.'
const CRUMBS = [{ label: 'Dues', href: '/dues' }, { label: 'Dues rates' }]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * /dues/rates — BL-137: the dues-rate schedule (migration 0069,
 * M5_APPLIED). Board/admin only (requireBoardOrAdmin redirects residents
 * before any read). With the flag off the page says so and reads nothing.
 * `?budget=<id>` (from the budget adoption kit) pre-fills a new rate from
 * that approved budget's assessment income ÷ homes. Nothing is sent from
 * here: the owner notice opens as a draft in Messages.
 */
export default async function DuesRatesPage({ searchParams }: { searchParams: Promise<{ budget?: string }> }) {
  await requireBoardOrAdmin()

  if (!M5_APPLIED) {
    return (
      <Page title="Dues rates" description={DESCRIPTION} breadcrumbs={CRUMBS} linkAs={Link}>
        <EmptyState
          icon={<BadgeDollarSign aria-hidden />}
          title="Dues rates are almost ready"
          description="They turn on after a database update. Until then, enter the amount each time you bill dues."
          action={
            <Button asChild variant="secondary">
              <Link href="/dues">Back to Dues</Link>
            </Button>
          }
        />
      </Page>
    )
  }

  const [sp, assoc] = await Promise.all([searchParams, getPrimaryAssociation()])
  if (!assoc) {
    return (
      <Page title="Dues rates" description={DESCRIPTION} breadcrumbs={CRUMBS} linkAs={Link}>
        <EmptyState
          icon={<BadgeDollarSign aria-hidden />}
          title="Set up your association first"
          description="Dues rates belong to an association."
          action={
            <Button asChild>
              <Link href="/settings">Open settings</Link>
            </Button>
          }
        />
      </Page>
    )
  }

  const supabase = await getSupabaseServerClient()
  const [rates, assocRes] = await Promise.all([
    loadDuesRates(supabase as unknown as LooseDb, assoc.id),
    loadOrFail('association', supabase.from('associations').select('name, state, governing_law_state').eq('id', assoc.id).maybeSingle()),
  ])
  if (rates === null || !assocRes.ok) {
    return (
      <Page title="Dues rates" description={DESCRIPTION} breadcrumbs={CRUMBS} linkAs={Link}>
        <LoadFailed what={rates === null ? 'your dues rates' : 'your association'} retryHref="/dues/rates" />
      </Page>
    )
  }
  const row = (assocRes.data ?? null) as { name: string | null; state: string | null; governing_law_state: string | null } | null
  const state = (row?.governing_law_state ?? row?.state ?? '').trim().toUpperCase() || null
  const today = todayIn(assoc.timeZone)

  const suggestion = UUID.test(sp.budget ?? '') ? await budgetSuggestion(sp.budget!) : null

  const current = rateInEffect(rates, today)
  const next = upcomingRate(rates, today)
  const nextChange = next ? rateChange(rates, next) : null
  const rules = nextChange ? rateChangeRules(state, nextChange.pct) : null
  const notice = nextChange ? buildRateNotice({ associationName: row?.name ?? assoc.name, change: nextChange }) : null

  const columns: DataTableColumn<DuesRate>[] = [
    {
      key: 'from',
      header: 'Starts',
      mobilePrimary: true,
      className: 'whitespace-nowrap',
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-2">
          {formatDay(r.effectiveFrom)}
          {current?.id === r.id ? <StatusPill tone="success" label="In effect" size="sm" /> : null}
          {r.effectiveFrom > today ? <StatusPill tone="info" label="Upcoming" size="sm" /> : null}
        </span>
      ),
    },
    { key: 'amount', header: 'Per home', cell: (r) => rateLabel(r) },
    { key: 'year', header: 'Per year', numeric: true, hideOnMobile: true, cell: (r) => centsLabel(annualCents(r)) },
    {
      key: 'change',
      header: 'Change',
      hideOnMobile: true,
      cell: (r) => pctPhrase(rateChange(rates, r).pct) ?? <span className="text-muted">First rate</span>,
    },
    {
      key: 'notes',
      header: 'Note',
      hideBelowLg: true,
      hideOnMobile: true,
      cell: (r) =>
        r.budgetId ? (
          <Link href={`/accounting/budget/${r.budgetId}`}>{r.notes ?? 'From the adopted budget'}</Link>
        ) : (
          (r.notes ?? <span className="text-muted">—</span>)
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (r) => (r.effectiveFrom > today ? <DeleteRateButton rateId={r.id} label={`${rateLabel(r)} from ${formatDay(r.effectiveFrom)}`} /> : null),
    },
  ]

  return (
    <Page title="Dues rates" description={DESCRIPTION} breadcrumbs={CRUMBS} linkAs={Link} width="default">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle as="h2">Current rate</CardTitle>
            <CardDescription>
              {current
                ? `Since ${formatDay(current.effectiveFrom)}. Generate dues and Add a due start from this rate.`
                : 'No rate is in effect yet, so billing starts with an empty amount. Add the rate your association charges today.'}
            </CardDescription>
          </CardHeader>
          {current ? (
            <CardContent>
              <p className="num text-2xl font-semibold text-foreground">{rateLabel(current)}</p>
              <p className="text-sm text-muted">{centsLabel(annualCents(current))} a year per home</p>
            </CardContent>
          ) : null}
        </Card>

        {nextChange && rules && notice ? (
          <Card>
            <CardHeader actions={<DraftRateNoticeButton draft={notice} />}>
              <CardTitle as="h2">Upcoming change: {formatDay(nextChange.to.effectiveFrom)}</CardTitle>
              <CardDescription>
                {rateLabel(nextChange.to)}
                {nextChange.from ? `, from ${rateLabel(nextChange.from)}` : ''}
                {pctPhrase(nextChange.pct) ? ` (${pctPhrase(nextChange.pct)} a year)` : ''}. Tell owners before it starts: Draft owner notice opens it in Messages, addressed to owners. Nothing is sent until you send it there.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {rules.findings.map((f) => (
                <Alert key={f.text} variant={f.tone === 'warn' ? 'warning' : 'info'}>
                  <p>{f.text}</p>
                  {f.citations.length > 0 ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium">What the statute says</summary>
                      <ul className="mt-1 space-y-1.5 text-xs">
                        {f.citations.map((c) => (
                          <li key={`${c.cite}|${c.quote.slice(0, 24)}`}>
                            <span className="font-semibold">{c.cite}:</span> “{c.quote}”
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </Alert>
              ))}
              <p className="text-xs text-muted">{NOT_LEGAL_ADVICE} Check your governing documents and ask your association’s attorney.</p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle as="h2">Add a rate</CardTitle>
            <CardDescription>
              Set the amount per home and the day it starts. Bills already made keep their amount.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {suggestion && 'reason' in suggestion ? (
              <Alert variant="warning" title="Couldn’t pre-fill from the budget" className="mb-4">
                {suggestion.reason}
              </Alert>
            ) : null}
            <AddRateForm
              rates={rates}
              today={today}
              initial={suggestion && !('reason' in suggestion) ? suggestion : null}
            />
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle as="h2">Schedule</CardTitle>
            <CardDescription>Every rate, newest first. A rate that has started stays here; only an upcoming one can be removed.</CardDescription>
          </CardHeader>
          {rates.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">No rates yet.</p>
            </CardContent>
          ) : (
            <DataTable framed={false} mobile="cards" caption="Dues rates" columns={columns} rows={rates} rowKey={(r) => r.id} />
          )}
        </Card>
      </div>
    </Page>
  )
}

/**
 * From the adoption kit: an approved budget's assessment income ÷ billable
 * homes, monthly, from the budget year's first day. A reason instead when
 * it can't be worked out.
 */
async function budgetSuggestion(budgetId: string): Promise<(BudgetSuggestion & { budgetId: string }) | { reason: string } | null> {
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok || !ctxRes.data) return { reason: 'Couldn’t load the budget. Enter the amount yourself.' }
  const loaded = await tryLoad('budget', () => loadBudgetNoticeInput(ctxRes.data!, budgetId))
  if (!loaded.ok || !loaded.data) return { reason: 'Couldn’t load that budget. Enter the amount yourself.' }
  const { input } = loaded.data
  if (input.status !== 'approved') return { reason: 'That budget isn’t approved yet. Approve it, then come back from its adoption checklist.' }
  const perHome = perHomeOf(input)
  if (perHome.kind === 'unknown') return { reason: perHome.reason }
  const s = suggestFromBudget(
    { annualCents: perHome.annualCents, homes: perHome.homes, assessmentIncomeCents: perHome.kind === 'units' ? perHome.assessmentIncomeCents : undefined },
    'monthly',
    input.period?.start_date ?? null,
  )
  if (!s) return { reason: 'The budget has no assessment income to divide among homes. Enter the amount yourself.' }
  return { ...s, budgetId }
}
