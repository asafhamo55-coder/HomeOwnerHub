import { LoadFailed } from '@homeowner-portal/ui'
import type { OwnerLine, Section } from '@/lib/annual-report/model'
import type { FinancialPacket, PacketYearSection } from '@/lib/records-requests/financial-packet'
import { formatDay, plural, usd } from '@/lib/money/format'

/**
 * BL-162: the 3-year financial packet, rendered from `FinancialPacket`
 * only — already owner-safe (lib/records-requests/financial-packet.ts).
 * Pure, so the render test can check the markup.
 */
export function FinancialPacketView({ packet }: { packet: FinancialPacket }) {
  return (
    <div className="space-y-10 print:space-y-6">
      {packet.years.map((y) => (
        <YearSection key={y.year.end} y={y} />
      ))}
    </div>
  )
}

function YearSection({ y }: { y: PacketYearSection }) {
  return (
    <section aria-label={y.year.label} className="min-w-0 space-y-6 print:break-before-page">
      <div className="border-b border-border pb-2">
        <h2 className="text-lg font-semibold text-foreground">{y.year.label}</h2>
        <p className="mt-0.5 text-sm text-muted">
          {formatDay(y.year.start)} to {formatDay(y.year.end)}
          {y.year.calendar ? ' · calendar year (no fiscal year on record)' : ''} · posted entries only
        </p>
      </div>

      <Part title="Balance sheet" subtitle={`As of ${formatDay(y.year.end)}`} s={y.balance} what="the balance sheet">
        {(b) => (
          <MoneyTable
            groups={[
              { title: 'Assets', rows: b.assets, total: ['Total assets', b.totalAssets] },
              { title: 'Liabilities', rows: b.liabilities, total: ['Total liabilities', b.totalLiabilities] },
              { title: 'Equity', rows: [...b.equity, { label: 'Net income for the year', amount: b.netIncomeToDate }], total: ['Total equity', b.totalEquity] },
            ]}
          />
        )}
      </Part>

      <Part title="Profit and loss (income statement)" subtitle="Accrual basis" s={y.income} what="the income statement">
        {(d) => (
          <MoneyTable
            groups={[
              { title: 'Income', rows: d.income, total: ['Total income', d.totalIncome] },
              { title: 'Expenses', rows: d.expenses, total: ['Total expenses', d.totalExpenses] },
              { title: d.net < 0 ? 'Net loss' : 'Net income', rows: [], total: [d.net < 0 ? 'Net loss' : 'Net income', d.net] },
            ]}
          />
        )}
      </Part>

      <Part title="Budget" subtitle="As adopted by the board, with the actual for the year" s={y.budgets} what="the budget">
        {(funds) =>
          funds.length === 0 ? (
            <Muted>No adopted budget for this year. A draft budget isn’t included.</Muted>
          ) : (
            <div className="space-y-4">
              {funds.map((f, i) => (
                <table key={i} className="w-full text-sm">
                  <caption className="pb-1 text-left text-sm font-medium text-foreground">{f.fund}</caption>
                  <thead>
                    <tr className="border-b border-border text-left text-muted">
                      <th className="py-1 font-medium">Account</th>
                      <th className="py-1 text-right font-medium">Budget</th>
                      <th className="py-1 text-right font-medium">Actual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.rows.map((r, j) => (
                      <tr key={j} className="border-b border-border/60">
                        <td className="py-1 [overflow-wrap:anywhere]">{r.label}</td>
                        <td className="num py-1 text-right">{usd(r.budgeted, { whole: true })}</td>
                        <td className="num py-1 text-right">{usd(r.actual, { whole: true })}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-1">Net surplus (deficit)</td>
                      <td className="num py-1 text-right">{usd(f.budgetedNet, { whole: true })}</td>
                      <td className="num py-1 text-right">{usd(f.actualNet, { whole: true })}</td>
                    </tr>
                  </tbody>
                </table>
              ))}
            </div>
          )
        }
      </Part>

      <Part title="Bank statements" subtitle="Attach the statements themselves; HomeownerHub doesn’t create them" s={y.statements} what="the documents list">
        {(st) => (
          <div className="space-y-2 text-sm">
            <p className="text-foreground-secondary">
              Found in Documents: {plural(st.docs.length, 'file')}, covering {st.monthsFound} of {st.monthsInYear} months.
              {st.monthsFound < st.monthsInYear ? ' Upload or attach the missing months before you hand the packet over.' : ''}
            </p>
            {st.docs.length > 0 ? (
              <ul className="list-disc space-y-0.5 pl-5">
                {st.docs.map((d) => (
                  <li key={d.id} className="[overflow-wrap:anywhere]">
                    {d.name}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </Part>
    </section>
  )
}

function Part<T>({
  title,
  subtitle,
  s,
  what,
  children,
}: {
  title: string
  subtitle: string
  s: Section<T>
  what: string
  children: (d: T) => React.ReactNode
}) {
  return (
    <div className="space-y-2 break-inside-avoid">
      <div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
      {s.state === 'failed' ? (
        <LoadFailed what={what} hint="The rest of the packet is unaffected. Reload before you print." />
      ) : s.state === 'none' ? (
        <Muted>{s.why}</Muted>
      ) : (
        children(s.data)
      )}
    </div>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>
}

function MoneyTable({ groups }: { groups: { title: string; rows: OwnerLine[]; total: [string, number] }[] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {groups.map((g) => (
          <MoneyGroup key={g.title} g={g} />
        ))}
      </tbody>
    </table>
  )
}

function MoneyGroup({ g }: { g: { title: string; rows: OwnerLine[]; total: [string, number] } }) {
  return (
    <>
      {g.rows.length > 0 ? (
        <tr>
          <th colSpan={2} scope="colgroup" className="pt-3 pb-1 text-left font-semibold text-foreground">
            {g.title}
          </th>
        </tr>
      ) : null}
      {g.rows.map((r, i) => (
        <tr key={i} className="border-b border-border/60">
          <td className="py-1 pl-3 [overflow-wrap:anywhere]">{r.label}</td>
          <td className="num py-1 text-right">{usd(r.amount)}</td>
        </tr>
      ))}
      <tr className="font-medium">
        <td className="py-1">{g.total[0]}</td>
        <td className="num py-1 text-right">{usd(g.total[1])}</td>
      </tr>
    </>
  )
}
