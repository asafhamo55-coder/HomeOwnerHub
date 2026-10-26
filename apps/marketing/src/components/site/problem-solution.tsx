import { Check, X } from 'lucide-react'
import { OTHER_HUBS_ENABLED } from '@/lib/hubs'

const problems = [
  'Volunteer board treasurers spending unpaid evenings on paperwork',
  'Violation notices stalled because nobody wants to draft a legal letter',
  'Meeting minutes that take an evening to write, and still miss the decisions',
  'Month-end board reports pieced together by hand from three spreadsheets',
  'The same resident questions answered by email, one at a time',
  // BL-097: the landlord row belongs to PM Hub, which is not offered right now.
  ...(OTHER_HUBS_ENABLED ? ['Landlords on Venmo + spreadsheets, missing late rent until it\'s a month behind'] : []),
]

const solutions = [
  { line: 'Covenant Brain answers any rule question, with the section cited.' },
  { line: 'Violation Drafter writes the letter. The board approves it in one click from Approvals.' },
  { line: 'Paste the meeting transcript and AI drafts board-ready minutes for the board to approve.' },
  { line: 'On the 1st, the board gets a month-end report: cash, dues collected, overdue balances, budget and violations.' },
  { line: 'The inbox drafts each reply with the home’s details alongside, and residents can ask the portal assistant first.' },
  ...(OTHER_HUBS_ENABLED ? [{ line: 'PM Hub tracks rent, sends reminders, and flags risk before it hurts.' }] : []),
]

export function ProblemSolution() {
  return (
    <section className="section">
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">The work nobody volunteered for</p>
          <h2 className="t-h2 mt-4 text-foreground">
            Volunteers shouldn’t spend their evenings on paperwork.{' '}
            <span className="t-serif text-primary">That’s what AI is for.</span>
          </h2>
          <p className="t-lead mt-5">
            {OTHER_HUBS_ENABLED
              ? 'HOA boards, landlords, and operators all do the same paperwork — at different stages of the same life cycle. We built one system that handles all of it.'
              : 'Rules, notices, minutes and money: the same paperwork every self-managed board does, handled in one system.'}
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-2">
          <div className="card p-7 md:p-9">
            <h3 className="text-sm font-semibold text-muted">Today</h3>
            <ul className="mt-5 space-y-4">
              {problems.map((p) => (
                <li key={p} className="flex gap-3 text-[15px] leading-relaxed text-foreground-secondary">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-danger-subtle text-danger">
                    <X className="h-3 w-3" aria-hidden />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative rounded-[1.25rem] border border-primary/25 bg-gradient-to-br from-primary-subtle via-surface to-surface p-7 shadow-[0_24px_50px_-30px_hsl(var(--primary)/0.55)] md:p-9">
            <h3 className="text-sm font-semibold text-primary">With HomeownerHub</h3>
            <ul className="mt-5 space-y-4">
              {solutions.map((s) => (
                <li key={s.line} className="flex gap-3 text-[15px] leading-relaxed text-foreground">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success">
                    <Check className="h-3 w-3" aria-hidden />
                  </span>
                  {s.line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
