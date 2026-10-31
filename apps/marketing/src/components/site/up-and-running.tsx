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
    <section className="section scroll-mt-20 bg-[#ffffff]" id="how-it-works" aria-labelledby="up-heading">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow !text-sm">Getting started</p>
          <h2 id="up-heading" className="t-h2 mt-4 text-foreground">
            Up and running in <span className="text-primary">three steps.</span>
          </h2>
          <p className="t-lead mt-5">You do every step yourself, on your own schedule.</p>
        </div>
        <ol className="relative mt-16 grid gap-6 md:grid-cols-3">
          <span
            aria-hidden
            className="absolute left-[16.7%] right-[16.7%] top-[3.25rem] hidden h-px border-t-2 border-dashed border-primary/30 md:block"
          />
          {STEPS.map((s, i) => (
            <li key={s.title} className="card relative p-8 text-center">
              <span className="relative mx-auto inline-flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl bg-primary text-primary-fg shadow-[0_14px_30px_-12px_rgba(75,39,201,0.6)]">
                <s.Icon className="h-8 w-8" aria-hidden />
                <span className="absolute -right-2.5 -top-2.5 inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#ffffff] bg-foreground text-sm font-bold text-background">
                  {i + 1}
                </span>
              </span>
              <h3 className="t-h3 mt-6 text-foreground">{s.title}</h3>
              <p className="mt-3 text-lg leading-relaxed text-foreground-secondary">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
