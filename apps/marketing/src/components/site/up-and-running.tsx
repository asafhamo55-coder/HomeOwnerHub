import { ClipboardList, Rocket, Users } from 'lucide-react'
import { TRIAL_DAYS } from '../../lib/hoa-pricing'

// Three steps, each a real flow: sign up (30-day trial), roster import
// (/properties/import in apps/hoa), invite owners (members and resident
// portal). No time promise is made beyond what a board can do itself.
const STEPS = [
  {
    Icon: Rocket,
    title: 'Start the trial',
    body: `Make an account for your association. The trial is ${TRIAL_DAYS} days and needs no credit card.`,
  },
  {
    Icon: ClipboardList,
    title: 'Load your roster',
    body: 'Upload a spreadsheet of your homes and owners. You see a row-by-row preview before anything is saved.',
  },
  {
    Icon: Users,
    title: 'Invite your owners',
    body: 'Send each owner a link to the resident portal. They see their balance and can ask the board a question.',
  },
]

export function UpAndRunning() {
  return (
    <section className="section scroll-mt-20" id="how-it-works" aria-labelledby="up-heading">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Getting started</p>
          <h2 id="up-heading" className="t-h2 mt-4 text-foreground">
            Up and running in <span className="text-primary">three steps.</span>
          </h2>
        </div>
        <ol className="mt-14 grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card p-7">
              <div className="flex items-center gap-4">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                  <s.Icon className="h-6 w-6" aria-hidden />
                </span>
                <span className="text-base font-semibold text-muted">Step {i + 1}</span>
              </div>
              <h3 className="t-h3 mt-5 text-foreground">{s.title}</h3>
              <p className="mt-2 text-base text-foreground-secondary">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
