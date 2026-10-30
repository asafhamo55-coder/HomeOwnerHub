import { LoadFailed, TableScroll, cn } from '@homeowner-portal/ui'
import { formatCents } from '@/lib/insurance/model'
import { ANNUAL_REPORT_NOT_LEGAL_ADVICE, annualReportLawNote, annualReportQuotes } from '@/lib/annual-report/law'
import type { AnnualReport, OwnerBudgetRow, OwnerLine, Section } from '@/lib/annual-report/model'
import { formatDay, plural, usd } from '@/lib/money/format'

/**
 * BL-153: the owner annual report, rendered from `AnnualReport` only —
 * which lib/annual-report/model.ts already built owner-safe, field by
 * field. Nothing here reads data. Pure, so the render test can check the
 * markup for per-home data and PII.
 *
 * `boardMessage` is the narrative slot: the page passes the client editor;
 * the test passes plain text.
 */
export function AnnualReportView({ report, boardMessage }: { report: AnnualReport; boardMessage: React.ReactNode }) {
  const w = report.window
  return (
    <div className="space-y-10 print:space-y-6">
      <ReportSection id="about" title="About this report" first>
        <AboutSection report={report} />
      </ReportSection>

      <ReportSection id="board" title="From the board">
        {boardMessage}
      </ReportSection>

      <ReportSection id="income" title="Income and expenses" subtitle={`${w.label} · accrual basis · posted entries only`}>
        <Body s={report.income} what="income and expenses">
          {(d) => (
            <>
              <Figures items={[['Income', d.totalIncome], ['Expenses', d.totalExpenses], [d.net < 0 ? 'Net loss' : 'Net income', d.net]]} />
              <MoneyTable
                caption="Income and expenses by account"
                groups={[
                  { title: 'Income', rows: d.income, total: ['Total income', d.totalIncome] },
                  { title: 'Expenses', rows: d.expenses, total: ['Total expenses', d.totalExpenses] },
                ]}
              />
            </>
          )}
        </Body>
      </ReportSection>

      <ReportSection id="budget" title="Against the budget" subtitle={`What was budgeted for the year, and what came in or went out through ${formatDay(w.end)}`}>
        <Body s={report.budget} what="the budget comparison">
          {(funds) =>
            funds.length === 0 ? (
              <Empty>No budget covers this period.</Empty>
            ) : (
              <div className="space-y-6">
                {funds.map((f, i) => (
                  <div key={i} className="space-y-2 break-inside-avoid">
                    <p className="text-sm font-medium text-foreground">
                      {f.fund}
                      {f.period ? ` · ${f.period}` : ''}
                      <span className="text-muted"> · {f.adopted ? 'adopted' : 'draft'}</span>
                    </p>
                    <TableScroll role="region" aria-label={`Budget and actual, ${f.fund}`}>
                    <table className="w-full text-sm">
                      <caption className="sr-only">Budget and actual, {f.fund}</caption>
                      <thead>
                        <tr className="border-b border-border text-left text-muted">
                          <th className="py-1 font-medium">Account</th>
                          <th className="py-1 text-right font-medium">Budget</th>
                          <th className="py-1 text-right font-medium">Actual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(['income', 'expense'] as const).map((kind) => (
                          <BudgetRows key={kind} title={kind === 'income' ? 'Income' : 'Expenses'} rows={f.rows.filter((r) => r.kind === kind)} />
                        ))}
                        <tr className="border-t border-border font-semibold">
                          <td className="py-1">Net surplus (deficit)</td>
                          <td className="num py-1 text-right">{usd(f.budgetedNet, { whole: true })}</td>
                          <td className="num py-1 text-right">{usd(f.actualNet, { whole: true })}</td>
                        </tr>
                      </tbody>
                    </table>
                    </TableScroll>
                  </div>
                ))}
              </div>
            )
          }
        </Body>
      </ReportSection>

      <ReportSection id="balance" title="Balance sheet" subtitle={`As of ${formatDay(w.end)} · posted entries only`}>
        <Body s={report.balance} what="the balance sheet">
          {(b) => (
            <>
              <Figures items={[['Total assets', b.totalAssets], ['Total liabilities', b.totalLiabilities], ['Total equity', b.totalEquity]]} />
              {!b.balanced ? <p className="text-sm text-danger">Assets don’t equal liabilities plus equity in the books. The board is looking into it.</p> : null}
              <MoneyTable
                caption="Balance sheet by account"
                groups={[
                  { title: 'Assets', rows: b.assets, total: ['Total assets', b.totalAssets] },
                  { title: 'Liabilities', rows: b.liabilities, total: ['Total liabilities', b.totalLiabilities] },
                  { title: 'Equity', rows: [...b.equity, { label: 'Net income, year to date', amount: b.netIncomeToDate }], total: ['Total equity', b.totalEquity] },
                ]}
              />
            </>
          )}
        </Body>
      </ReportSection>

      <ReportSection id="reserves" title="Reserves" subtitle="Money set aside for major repairs and replacements">
        <Body s={report.reserves} what="the reserve snapshot">
          {(r) =>
            r.kind === 'no_reserve_fund' ? (
              <Empty>The association has no reserve fund in its books.</Empty>
            ) : (
              <>
                <Figures items={[[`Balance on ${formatDay(r.asOf)}`, r.balance], [`Put in (${r.year})`, r.contributions], ['Spent from reserves', r.draws]]} />
                <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                  <li>Interest earned: {usd(r.interest, { whole: true })}</li>
                  {r.budgetedAnnual !== null ? (
                    <li>
                      Budgeted to put in this year: {usd(r.budgetedAnnual, { whole: true })}
                      {r.budgetedToDate !== null ? ` (${usd(r.budgetedToDate, { whole: true })} by now)` : ''}
                      {r.behindBudget ? '. Contributions are behind the budget.' : '.'}
                    </li>
                  ) : (
                    <li>No reserve contribution is set in this year’s budget.</li>
                  )}
                </ul>
              </>
            )
          }
        </Body>
      </ReportSection>

      <ReportSection id="projection" title="Budget projection for next year">
        <Body s={report.projection} what="next year’s budget">
          {(funds) =>
            funds.length === 0 ? (
              <Empty>Next year’s budget isn’t drafted yet. The board will share it when it is.</Empty>
            ) : (
              <div className="space-y-6">
                {funds.map((f, i) => (
                  <div key={i} className="space-y-2 break-inside-avoid">
                    <p className="text-sm font-medium text-foreground">
                      {f.fund}
                      {f.period ? ` · ${f.period}` : ''}
                      <span className="text-muted"> · {f.adopted ? 'adopted by the board' : 'proposed (draft)'}</span>
                    </p>
                    <Figures items={[['Income', f.totalIncome], ['Expenses', f.totalExpenses], [f.net < 0 ? 'Deficit' : 'Surplus', f.net]]} />
                    {f.currentIncome !== null && f.currentExpenses !== null ? (
                      <p className="text-sm text-foreground-secondary">
                        This year’s budget: income {usd(f.currentIncome, { whole: true })}, expenses {usd(f.currentExpenses, { whole: true })}.
                      </p>
                    ) : null}
                    <MoneyTable
                      caption={`Next year’s budget, ${f.fund}`}
                      groups={[
                        { title: 'Income', rows: f.income, total: ['Total income', f.totalIncome] },
                        { title: 'Expenses', rows: f.expenses, total: ['Total expenses', f.totalExpenses] },
                      ]}
                    />
                  </div>
                ))}
              </div>
            )
          }
        </Body>
      </ReportSection>

      <ReportSection id="collections" title="Collections" subtitle="Totals and counts only. No home is named.">
        <Body s={report.collections} what="the collections summary">
          {(c) =>
            c.homesBehind === 0 ? (
              <Empty>No home was behind on {formatDay(c.asOf)}.</Empty>
            ) : (
              <>
                <Figures items={[['Overdue', c.totalOverdue], ['More than 90 days late', c.aging.d90_plus]]} extra={['Homes behind', String(c.homesBehind)]} />
                <p className="text-sm text-foreground-secondary">
                  On {formatDay(c.asOf)}: {plural(c.charges, 'unpaid charge')} past due across {plural(c.homesBehind, 'home')}. By age: 1–30 days{' '}
                  {usd(c.aging.d1_30, { whole: true })}, 31–60 days {usd(c.aging.d31_60, { whole: true })}, 61–90 days {usd(c.aging.d61_90, { whole: true })}, over 90 days{' '}
                  {usd(c.aging.d90_plus, { whole: true })}.
                </p>
              </>
            )
          }
        </Body>
      </ReportSection>

      <ReportSection id="insurance" title="Insurance" subtitle={`Policies in force on ${formatDay(report.preparedOn)}`}>
        <Body s={report.insurance} what="the insurance summary">
          {(policies) =>
            policies.length === 0 ? (
              <Empty>No policy in force is on record in HomeownerHub.</Empty>
            ) : (
              <TableScroll role="region" aria-label="Association insurance">
              <table className="w-full text-sm">
                <caption className="sr-only">Association insurance</caption>
                <thead>
                  <tr className="border-b border-border text-left text-muted">
                    <th className="py-1 font-medium">Coverage</th>
                    <th className="py-1 font-medium">Insurer</th>
                    <th className="py-1 text-right font-medium">Limit</th>
                    <th className="py-1 text-right font-medium">Deductible</th>
                    <th className="py-1 text-right font-medium">In force until</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((p, i) => (
                    <tr key={i} className="border-b border-border/60">
                      <td className="py-1">{p.kind}</td>
                      <td className="py-1">{p.insurer}</td>
                      <td className="num py-1 text-right">{p.limitCents === null ? '—' : formatCents(p.limitCents)}</td>
                      <td className="num py-1 text-right">{p.deductibleCents === null ? '—' : formatCents(p.deductibleCents)}</td>
                      <td className="py-1 text-right whitespace-nowrap">{formatDay(p.inForceUntil)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </TableScroll>
            )
          }
        </Body>
      </ReportSection>

      <ReportSection id="compliance" title="State-law obligations" subtitle={`Where each one stands on ${formatDay(report.preparedOn)}`}>
        <Body s={report.compliance} what="the state-law obligations">
          {(items) =>
            items.length === 0 ? (
              <Empty>No state-law obligation is tracked for this association.</Empty>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {items.map((c, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 text-foreground">{c.title}</span>
                    <span className={cn('text-foreground-secondary', c.tone === 'overdue' && 'font-medium text-danger')}>{c.status}</span>
                  </li>
                ))}
              </ul>
            )
          }
        </Body>
      </ReportSection>

      <ReportSection id="meetings" title="Meetings and motions passed" subtitle={`${formatDay(w.start)} to ${formatDay(report.meeting.date < report.preparedOn ? report.meeting.date : report.preparedOn)} · motions from approved minutes`}>
        <Body s={report.meetings} what="the year’s meetings">
          {(m) => (
            <>
              {m.meetings.length === 0 ? (
                <Empty>No meeting is on record for this period.</Empty>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                  {m.meetings.map((x, i) => (
                    <li key={i}>
                      {formatDay(x.date)} · {x.type}
                    </li>
                  ))}
                </ul>
              )}
              {m.motions.length > 0 ? (
                <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">
                  {m.motions.map((x, i) => (
                    <li key={i} className="[overflow-wrap:anywhere]">
                      <span className="text-muted">{formatDay(x.date)}:</span> {x.text}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted">No passed motion is recorded in approved minutes for this period.</p>
              )}
            </>
          )}
        </Body>
      </ReportSection>

      <ReportSection id="elections" title="Board elections">
        <Body s={report.elections} what="the elections">
          {(list) =>
            list.length === 0 ? (
              <Empty>No board election is planned or recorded in HomeownerHub for this period.</Empty>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                {list.map((e, i) => (
                  <li key={i}>
                    {formatDay(e.meetingDate)}
                    {e.seats !== null ? ` · ${plural(e.seats, 'seat')}` : ''} ·{' '}
                    {e.state === 'results'
                      ? `elected: ${e.elected.join(', ') || 'no one'}`
                      : e.state === 'tie'
                        ? 'the vote for the last seat was tied; the bylaws decide how it is settled'
                        : 'results not recorded yet'}
                  </li>
                ))}
              </ul>
            )
          }
        </Body>
      </ReportSection>
    </div>
  )
}

function AboutSection({ report }: { report: AnnualReport }) {
  const quotes = annualReportQuotes(report.jurisdiction)
  return (
    <div className="max-w-prose space-y-3 text-sm text-foreground">
      <p>
        The board’s report to owners on {report.associationName}’s affairs and finances for {report.window.label}, and its budget for next year.
        Figures come from the association’s books in HomeownerHub. They are not audited.
      </p>
      {quotes.map((q) => (
        <figure key={q.cite} className="border-l-2 border-border pl-3">
          <blockquote className="italic">“{q.quote}”</blockquote>
          <figcaption className="mt-1 text-xs text-muted">{q.cite}</figcaption>
        </figure>
      ))}
      <p className="text-foreground-secondary">{annualReportLawNote(report.jurisdiction)}</p>
      {quotes.length > 0 ? <p className="text-xs text-muted">{ANNUAL_REPORT_NOT_LEGAL_ADVICE}</p> : null}
    </div>
  )
}

function ReportSection({
  id,
  title,
  subtitle,
  first = false,
  children,
}: {
  id: string
  title: string
  subtitle?: string
  first?: boolean
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={`ar-${id}`} className={cn('min-w-0 space-y-4', !first && 'print:break-inside-avoid-page')}>
      <div className="break-after-avoid border-b border-border pb-2">
        <h2 id={`ar-${id}`} className="text-lg font-semibold text-foreground">
          {title}
        </h2>
        {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}

function Body<T>({ s, what, children }: { s: Section<T>; what: string; children: (d: T) => React.ReactNode }) {
  if (s.state === 'failed') return <LoadFailed what={what} hint="The rest of the report is unaffected. Reload before you print." />
  if (s.state === 'none') return <Empty>{s.why}</Empty>
  return <>{children(s.data)}</>
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>
}

function Figures({ items, extra }: { items: [string, number][]; extra?: [string, string] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-3 sm:gap-4 print:grid-cols-3">
      {items.map(([label, n]) => (
        <div key={label} className="rounded-lg border border-border px-3 py-2">
          <dt className="text-xs text-muted">{label}</dt>
          <dd className={cn('num text-lg font-semibold text-foreground', n < 0 && 'text-danger')}>{usd(n, { whole: true })}</dd>
        </div>
      ))}
      {extra ? (
        <div className="rounded-lg border border-border px-3 py-2">
          <dt className="text-xs text-muted">{extra[0]}</dt>
          <dd className="num text-lg font-semibold text-foreground">{extra[1]}</dd>
        </div>
      ) : null}
    </dl>
  )
}

function MoneyTable({ caption, groups }: { caption: string; groups: { title: string; rows: OwnerLine[]; total: [string, number] }[] }) {
  return (
    <TableScroll role="region" aria-label={caption}>
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <tbody>
          {groups.map((g) => (
            <MoneyGroup key={g.title} group={g} />
          ))}
        </tbody>
      </table>
    </TableScroll>
  )
}

function MoneyGroup({ group }: { group: { title: string; rows: OwnerLine[]; total: [string, number] } }) {
  return (
    <>
      <tr>
        <th colSpan={2} scope="colgroup" className="pt-3 pb-1 text-left font-semibold text-foreground">
          {group.title}
        </th>
      </tr>
      {group.rows.map((r, i) => (
        <tr key={i} className="border-b border-border/60">
          <td className="py-1 pl-3 [overflow-wrap:anywhere]">{r.label}</td>
          <td className="num py-1 text-right">{usd(r.amount)}</td>
        </tr>
      ))}
      <tr className="font-medium">
        <td className="py-1">{group.total[0]}</td>
        <td className="num py-1 text-right">{usd(group.total[1])}</td>
      </tr>
    </>
  )
}

function BudgetRows({ title, rows }: { title: string; rows: OwnerBudgetRow[] }) {
  return (
    <>
      <tr>
        <th colSpan={3} scope="colgroup" className="pt-3 pb-1 text-left font-semibold text-foreground">
          {title}
        </th>
      </tr>
      {rows.map((r, i) => (
        <tr key={i} className="border-b border-border/60">
          <td className="py-1 pl-3 [overflow-wrap:anywhere]">{r.label}</td>
          <td className="num py-1 text-right">{usd(r.budgeted, { whole: true })}</td>
          <td className="num py-1 text-right">{usd(r.actual, { whole: true })}</td>
        </tr>
      ))}
    </>
  )
}
