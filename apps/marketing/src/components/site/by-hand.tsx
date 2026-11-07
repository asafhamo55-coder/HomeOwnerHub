import { BookOpenText, CalendarCheck, FileText, Megaphone, Table2 } from 'lucide-react'

// "What you stop doing by hand": each row restates a workflow the app ships
// today (violation letters, cited CC&R answers, dues ledger, quorum and
// proxies, announcements). No numbers, no time-saved claims.
const ROWS = [
  {
    Icon: FileText,
    before: 'Retyping the same violation letter in a word processor',
    after: 'The letter is drafted from the violation record. The board reads it and approves it.',
  },
  {
    Icon: BookOpenText,
    before: 'Paging through the CC&Rs to answer an owner',
    after: 'Ask in plain words and get an answer that shows the section it came from.',
  },
  {
    Icon: Table2,
    before: 'Keeping dues in a spreadsheet only one person understands',
    after: 'Balances, credits and late fees sit on one page that the whole board can open.',
  },
  {
    Icon: Megaphone,
    before: 'Rewriting one announcement for email and for text',
    after: 'Write it once, review the draft, and send it to owners.',
  },
  {
    Icon: CalendarCheck,
    before: 'Counting proxies on paper at the annual meeting',
    after: 'Check in owners and proxies as they arrive and watch quorum update.',
  },
]

export function ByHand() {
  return (
    <section className="section" aria-labelledby="byhand-heading">
      <div className="container-page">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:gap-20">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="eyebrow !text-sm">Why boards switch</p>
            <h2 id="byhand-heading" className="t-h2 mt-4 text-foreground">
              Stop doing the <span className="text-primary">repeat work</span> by hand.
            </h2>
            <p className="t-lead mt-5 max-w-md">
              Most of a volunteer board’s evenings go to the same five chores. Here is what changes.
            </p>
          </div>
          <ul className="grid gap-4">
            {ROWS.map(({ Icon, before, after }) => (
              <li key={before} className="card flex gap-5 p-6 sm:p-7">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <div>
                  <p className="text-lg text-muted line-through decoration-[#526077]/50">{before}</p>
                  <p className="mt-2 text-lg font-medium leading-snug text-foreground">{after}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
