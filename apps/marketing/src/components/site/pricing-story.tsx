import { CalendarX2, CreditCard, ShieldCheck, ArrowRight, Check, X } from 'lucide-react'
import Link from 'next/link'
import { SIGN_UP_URL } from './brand'
import { TRIAL_DAYS } from '../../lib/hoa-pricing'

// Reassurance band and the "by hand" value story for /pricing. No numbers
// here except the trial length, which comes from hoa-pricing.

const REASSURE = [
  { icon: ShieldCheck, title: `${TRIAL_DAYS}-day free trial`, body: 'Use it on your own documents before you decide anything.' },
  { icon: CreditCard, title: 'No credit card', body: 'We do not ask for one to start, and nothing bills by surprise.' },
  { icon: CalendarX2, title: 'Cancel anytime', body: 'Month to month. Cancel in Settings, Billing, and download your data.' },
]

export function ReassuranceBand() {
  return (
    <section aria-label="Trial and cancellation terms" className="pb-4">
      <div className="container-page">
        <ul className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
          {REASSURE.map((r) => (
            <li key={r.title} className="flex gap-4 rounded-2xl border border-border bg-surface p-5 ring-card">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary-subtle text-primary">
                <r.icon className="h-6 w-6" aria-hidden />
              </span>
              <div>
                <p className="text-lg font-semibold text-foreground">{r.title}</p>
                <p className="mt-1 text-base text-foreground-secondary">{r.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

// Each pair maps to a shipped workflow in apps/hoa.
const PAIRS: Array<{ job: string; hand: string; hub: string }> = [
  {
    job: 'A violation letter',
    hand: 'Find the rule, write the letter, mail it.',
    hub: 'Drafted from the photo with the rule cited. A board member approves it in one click.',
  },
  {
    job: 'Meeting minutes',
    hand: 'Replay notes and write them up after a long evening.',
    hub: 'Drafted from your transcript, ready for the board to edit.',
  },
  {
    job: 'A rules question',
    hand: 'Dig through the CC&Rs and bylaws PDFs to find the section.',
    hub: 'Ask in plain English and get the section cited.',
  },
  {
    job: 'A vendor invoice',
    hand: 'Retype it into a spreadsheet and chase approvals by email.',
    hub: 'Scan the bill into the approvals queue.',
  },
  {
    job: 'Announcements',
    hand: 'Write it, build the mailing list, send, wonder who read it.',
    hub: 'Drafted from a sentence, sent by street, with results by home.',
  },
]

export function ByHandStory() {
  return (
    <section className="section" aria-labelledby="byhand-h">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Compared with doing it by hand</p>
          <h2 id="byhand-h" className="t-h2 mt-4 text-foreground">
            The same jobs, with less evening work.
          </h2>
          <p className="t-lead mt-4">
            HomeownerHub drafts. Your board still reads and approves everything that goes out.
          </p>
        </div>
        <div className="mx-auto mt-12 max-w-5xl overflow-hidden rounded-3xl border border-border bg-surface ring-card">
          <div className="hidden grid-cols-[1fr,1.2fr,1.2fr] gap-6 border-b border-border bg-subtle px-6 py-3 text-sm font-semibold uppercase tracking-wider text-foreground-secondary md:grid">
            <span>The job</span>
            <span>By hand</span>
            <span>With HomeownerHub</span>
          </div>
          <ul className="divide-y divide-border">
            {PAIRS.map((p) => (
              <li key={p.job} className="grid gap-3 px-5 py-6 md:grid-cols-[1fr,1.2fr,1.2fr] md:gap-6 md:px-6">
                <p className="text-lg font-semibold text-foreground">{p.job}</p>
                <p className="flex gap-2.5 text-base text-foreground-secondary">
                  <X className="mt-1 h-5 w-5 shrink-0 text-muted" aria-hidden />
                  <span><span className="sr-only">By hand: </span>{p.hand}</span>
                </p>
                <p className="flex gap-2.5 text-base text-foreground">
                  <Check className="mt-1 h-5 w-5 shrink-0 text-success" aria-hidden />
                  <span><span className="sr-only">With HomeownerHub: </span>{p.hub}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-8 text-center">
          <Link href={SIGN_UP_URL} className="btn btn-primary">
            Start free trial
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </p>
      </div>
    </section>
  )
}
