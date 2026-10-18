'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { RotateCcw, Save, Sparkles } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Kpi,
  Select,
  useConfirm,
  useToast,
} from '@homeowner-portal/ui'
import {
  DEFAULT_INFLATION_PCT,
  buildBudgetDraft,
  mainChanges,
  parseInflationPct,
  totalsOf,
  wholeUsd,
  type DraftLine,
  type DraftSource,
} from '@/lib/accounting/budget-draft'
import { saveDraftBudget, summarizeDraftBudget } from '@/lib/budget-draft-actions'
import type { NextFiscalYearOffer } from '@/lib/accounting/open-next-fiscal-year'
import { OpenNextFiscalYearButton } from '../../_components/OpenNextFiscalYearButton'

interface Option {
  id: string
  label: string
}

export interface BudgetDraftEditorProps {
  funds: { id: string; name: string }[]
  fundId: string
  fundName: string
  /** Years the draft can be saved to; empty when none is open. */
  targets: Option[]
  targetId: string | null
  /** The year being drafted, e.g. "FY 2027". */
  yearLabel: string
  /** Set when next year isn't a fiscal period yet. */
  nextYearMissingLabel: string | null
  /**
   * BL-076: what "Open next fiscal year" would add, when the viewer is an
   * admin and the books' structure allows it; null otherwise.
   */
  openNextYear?: NextFiscalYearOffer | null
  /** "FY 2026 budget (approved)", or null when there's no earlier budget. */
  sourceLabel: string | null
  windowLabel: string
  source: DraftSource
}

const signed = (n: number) => (n >= 0 ? `+${wholeUsd(n)}` : wholeUsd(n))

/**
 * BL-029 review screen. Every suggestion and reason comes from
 * buildBudgetDraft (re-run here as the inflation rate changes); the board
 * can overwrite any amount, and an overwritten line keeps its amount when
 * the rate changes. Nothing is saved until Save as draft budget is
 * confirmed, and what's saved is a DRAFT through the normal budget path.
 */
export function BudgetDraftEditor(props: BudgetDraftEditorProps) {
  const { funds, fundId, fundName, targets, targetId, yearLabel, nextYearMissingLabel, openNextYear = null, sourceLabel, windowLabel, source } = props
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()

  const [inflationRaw, setInflationRaw] = useState(String(DEFAULT_INFLATION_PCT))
  const parsedInflation = parseInflationPct(inflationRaw)
  const [inflation, setInflation] = useState(DEFAULT_INFLATION_PCT)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [createdBudgetId, setCreatedBudgetId] = useState<string | undefined>()
  const [saving, startSave] = useTransition()
  const [summarizing, startSummary] = useTransition()
  const [narrative, setNarrative] = useState<{ text: string | null } | null>(null)

  const draft = useMemo(() => buildBudgetDraft(source, inflation), [source, inflation])
  const amountOf = (l: DraftLine) => {
    const o = overrides[l.accountId]
    return o === undefined ? l.suggested : Number(o) || 0
  }
  const totals = totalsOf(draft.lines.map((l) => ({ type: l.accountType, amount: amountOf(l), prior: l.priorBudget ?? 0 })))
  const changes = mainChanges(draft.lines.map((l) => ({ ...l, suggested: amountOf(l) })))
  const canSave = targetId !== null && !saving

  function onInflation(raw: string) {
    setInflationRaw(raw)
    const n = parseInflationPct(raw)
    if (n !== null) {
      setInflation(n)
      setNarrative(null)
    }
  }

  function goTo(params: { fund?: string; period?: string }) {
    const q = new URLSearchParams()
    q.set('fund', params.fund ?? fundId)
    if (params.period) q.set('period', params.period)
    router.push(`/accounting/budget/draft?${q.toString()}`)
  }

  async function save() {
    const errs: Record<string, string> = {}
    for (const l of draft.lines) {
      const o = overrides[l.accountId]
      if (o !== undefined && o.trim() !== '' && (!Number.isFinite(Number(o)) || Number(o) < 0)) errs[l.accountId] = 'Enter an amount of $0 or more.'
    }
    setRowErrors(errs)
    if (Object.keys(errs).length > 0 || !targetId) return
    const nonZero = draft.lines.filter((l) => amountOf(l) > 0).length
    const ok = await confirm({
      title: `Save as a draft budget for ${yearLabel}?`,
      description: `${nonZero} line${nonZero === 1 ? '' : 's'}: ${wholeUsd(totals.income)} income and ${wholeUsd(totals.expense)} expenses for ${fundName}. It stays a draft — the board approves it on the budget page. Lines at $0 aren’t saved.`,
      confirmLabel: 'Save draft',
    })
    if (!ok) return
    startSave(async () => {
      const result = await saveDraftBudget({
        fiscalPeriodId: targetId,
        fundId,
        budgetId: createdBudgetId,
        lines: draft.lines.map((l) => ({
          accountId: l.accountId,
          amount: Math.round(amountOf(l) * 100) / 100,
          note: overrides[l.accountId] === undefined ? `Draft: ${l.explanation}` : `Draft suggested ${wholeUsd(l.suggested)} (${l.explanation}); changed by the board`,
        })),
      })
      if (!result.ok) {
        if (result.budgetId) setCreatedBudgetId(result.budgetId)
        toast({ tone: 'error', title: 'Couldn’t save the draft', message: result.error })
        return
      }
      toast({ tone: 'success', message: `Draft budget for ${yearLabel} saved.` })
      router.push(`/accounting/budget/${result.budgetId}`)
      router.refresh()
    })
  }

  function summarize() {
    startSummary(async () => {
      const result = await summarizeDraftBudget({
        yearLabel,
        fundName,
        inflationPct: inflation,
        lines: draft.lines.map((l) => ({ accountName: l.accountName, accountType: l.accountType, priorBudget: l.priorBudget, amount: amountOf(l) })),
      })
      if (!result.ok) {
        toast({ tone: 'error', title: 'No AI summary', message: result.error })
        return
      }
      setNarrative({ text: result.narrative })
    })
  }

  return (
    <div className="space-y-6">
      {nextYearMissingLabel ? (
        <Alert
          variant="warning"
          title={`${nextYearMissingLabel} isn’t open in the books yet`}
          actions={openNextYear ? <OpenNextFiscalYearButton {...openNextYear} variant="default" /> : null}
        >
          {targets.length > 0
            ? `There’s no fiscal period for ${nextYearMissingLabel}, so the draft can only be saved to a year that is open. Review it now, or save it once ${nextYearMissingLabel} exists.`
            : `There’s no fiscal period for ${nextYearMissingLabel}, so there’s nowhere to save this draft yet. You can review and adjust it now; saving turns on once ${nextYearMissingLabel} is open in Accounting.`}{' '}
          {openNextYear
            ? `Open it now — ${openNextYear.currentLabel ?? 'the current year'} stays the current year until ${openNextYear.label} starts, and this draft stays on screen.`
            : 'An admin of your HOA can open it from Accounting › Fiscal periods.'}
        </Alert>
      ) : null}

      {!draft.hasPriorData ? (
        <Alert variant="info" title="Nothing to start from yet">
          There’s no earlier budget for {fundName} and no posted activity in the last 12 months, so every line starts at $0. Enter the
          amounts you expect — it saves as a draft like any other budget.
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle as="h2">Where the numbers come from</CardTitle>
          <CardDescription>
            Each line starts from what was actually spent or collected, adjusted for inflation. Where there was no activity, it starts
            from last year’s budget.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Fund">
            <Select value={fundId} onValueChange={(v) => goTo({ fund: v })}>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Budget year" hint={targets.length === 0 ? 'No open year without a budget for this fund.' : undefined}>
            <Select value={targetId ?? undefined} onValueChange={(v) => goTo({ period: v })} disabled={targets.length === 0} placeholder={yearLabel}>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Inflation adjustment"
            hint="Applied to every line. 0–20%."
            error={parsedInflation === null ? 'Enter a percentage from 0 to 20, like 3 or 4.5.' : undefined}
          >
            <Input inputMode="decimal" suffix="%" value={inflationRaw} onChange={(e) => onInflation(e.target.value)} className="text-right" />
          </Field>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-muted">Last year’s budget</dt>
              <dd className="text-foreground">{sourceLabel ?? `No earlier budget for ${fundName}`}</dd>
            </div>
            <div>
              <dt className="text-muted">Actuals (posted entries)</dt>
              <dd className="text-foreground">
                {windowLabel}
                {source.actualMonths > 0 && source.actualMonths < 12 ? (
                  <span className="block text-muted">
                    Your books cover {source.actualMonths} of the last 12 months, so activity is annualized.
                  </span>
                ) : null}
                {source.actualMonths === 0 ? <span className="block text-muted">No books in this window.</span> : null}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <section aria-label="Totals" className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <Kpi label="Income" value={wholeUsd(totals.income)} hint={`Last year budget ${wholeUsd(totals.priorIncome)}`} />
        <Kpi label="Expenses" value={wholeUsd(totals.expense)} hint={`Last year budget ${wholeUsd(totals.priorExpense)}`} />
        <Kpi
          label={totals.net < 0 ? 'Planned deficit' : 'Planned surplus'}
          value={<span className={totals.net < 0 ? 'text-danger' : undefined}>{wholeUsd(totals.net)}</span>}
          hint="Income minus expenses"
        />
      </section>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle as="h2">Lines for {yearLabel}</CardTitle>
          <CardDescription>Check every line. Change any amount; the reason under each account says where the suggestion came from.</CardDescription>
        </CardHeader>
        <div
          aria-hidden
          className="hidden border-y border-border bg-subtle px-5 py-2.5 text-xs font-medium text-muted md:grid md:grid-cols-[minmax(0,1fr)_7rem_7rem_7rem_9rem] md:gap-4"
        >
          <span>Account</span>
          <span className="text-right">Last year budget</span>
          <span className="text-right">Actual, 12 mo</span>
          <span className="text-right">Suggested</span>
          <span className="text-right">Amount</span>
        </div>
        <ul className="divide-y divide-border">
          {draft.lines.map((l) => {
            const overridden = overrides[l.accountId] !== undefined
            const label = `${l.accountNumber} ${l.accountName}`
            return (
              <li key={l.accountId} className="px-5 py-3 md:grid md:grid-cols-[minmax(0,1fr)_7rem_7rem_7rem_9rem] md:items-start md:gap-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                    <span className="num text-muted">{l.accountNumber}</span>
                    <span>{l.accountName}</span>
                    {l.accountType === 'income' ? <Badge size="sm">Income</Badge> : null}
                    {l.reserveFloor ? (
                      <Badge size="sm" variant="warning">
                        Reserve floor
                      </Badge>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{l.explanation}</p>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-sm md:contents">
                  <div className="md:text-right">
                    <dt className="text-xs text-muted md:sr-only">Last year budget</dt>
                    <dd className="num text-foreground">{l.priorBudget === null ? '—' : wholeUsd(l.priorBudget)}</dd>
                  </div>
                  <div className="md:text-right">
                    <dt className="text-xs text-muted md:sr-only">Actual, 12 mo</dt>
                    <dd className="num text-foreground">{l.actual === null ? '—' : wholeUsd(l.actual)}</dd>
                  </div>
                  <div className="md:text-right">
                    <dt className="text-xs text-muted md:sr-only">Suggested</dt>
                    <dd className="num text-foreground">{wholeUsd(l.suggested)}</dd>
                  </div>
                </dl>
                <div className="mt-2 md:mt-0">
                  <Input
                    aria-label={`Amount for ${label}`}
                    aria-invalid={rowErrors[l.accountId] ? true : undefined}
                    inputMode="decimal"
                    prefix="$"
                    value={overridden ? overrides[l.accountId] : String(l.suggested)}
                    onChange={(e) => {
                      setOverrides((prev) => ({ ...prev, [l.accountId]: e.target.value }))
                      setNarrative(null)
                    }}
                    className="text-right"
                  />
                  {rowErrors[l.accountId] ? <p className="mt-1 text-xs text-danger">{rowErrors[l.accountId]}</p> : null}
                  {overridden ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 md:ml-auto md:flex"
                      icon={<RotateCcw aria-hidden />}
                      onClick={() =>
                        setOverrides((prev) => {
                          const next = { ...prev }
                          delete next[l.accountId]
                          return next
                        })
                      }
                    >
                      Use suggestion
                    </Button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
        <CardFooter className="flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            Nothing is saved until you select Save as draft budget. It saves as a draft; approving it is a separate step.
          </p>
          <Button icon={<Save aria-hidden />} onClick={save} loading={saving} disabled={!canSave}>
            Save as draft budget
          </Button>
        </CardFooter>
      </Card>

      {draft.hasPriorData ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Main changes vs last year</CardTitle>
            <CardDescription>The largest moves against last year’s budget, from the amounts above. For the board packet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {changes.length === 0 ? (
              <p className="text-sm text-muted">No line moves against last year’s budget.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {changes.map((c) => (
                  <li key={c.accountName} className="flex flex-wrap justify-between gap-x-4">
                    <span className="text-foreground">{c.accountName}</span>
                    <span className="num text-muted">
                      {wholeUsd(c.from)} → {wholeUsd(c.to)} <span className="text-foreground">({signed(c.change)})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {narrative ? (
              narrative.text ? (
                <div className="rounded-lg bg-subtle p-3.5 text-sm">
                  <p className="text-foreground">{narrative.text}</p>
                  <p className="mt-2 text-xs text-muted">Written by AI from the figures above. Read it before it goes in the packet.</p>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  The AI summary used a figure that isn’t in the list above, so it was discarded. The list is complete on its own.
                </p>
              )
            ) : null}
          </CardContent>
          <CardFooter>
            <Button variant="secondary" icon={<Sparkles aria-hidden />} onClick={summarize} loading={summarizing} disabled={changes.length === 0}>
              Write a summary with AI
            </Button>
          </CardFooter>
        </Card>
      ) : null}
    </div>
  )
}
