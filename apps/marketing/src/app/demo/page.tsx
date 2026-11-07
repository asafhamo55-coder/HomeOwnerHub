import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  Check,
  X,
} from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { TrackedLink } from '@/components/site/tracked-link'
import { SIGN_UP_URL } from '@/components/site/brand'
import { HOA_PRICE_COPY, TRIAL_DAYS } from '@/lib/hoa-pricing'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'
import { STATE_COVERAGE_SENTENCE } from '@/lib/state-law'
import { DemoForm } from './demo-form'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/demo']!, path: '/demo' })

const steps = [
  {
    title: 'We reply within 1 business day',
    body: 'We email you to find a time that suits your board. In person in metro Atlanta, by video everywhere else.',
  },
  {
    title: 'You send your CC&R and bylaws',
    // The form has no upload: the PDFs come by reply email.
    body: 'Reply to our email with the PDFs. We load them before the call so the demo runs on your rules, not ours.',
  },
  {
    title: 'We show it on your documents',
    body: 'Twenty minutes. Your board decides afterwards, on its own timeline. Nothing is charged and nothing converts by itself.',
  },
]

export default function DemoPage() {
  return (
    <>
      <Nav />
    <main id="main-content">

      <section className="hero-wash relative overflow-hidden pb-20 pt-28 md:pt-36">
        <div className="container-page">
          <div className="grid items-start gap-12 lg:grid-cols-[1.05fr,1fr] lg:gap-16">
            <div>
              <p className="eyebrow">Book a demo</p>
              <h1 className="mt-5 text-[clamp(2.25rem,1.4rem+2.5vw,3.5rem)] font-medium leading-[1.06] tracking-[-0.03em] text-foreground">
                See your own rules answered in 20 minutes.
              </h1>
              <p className="t-lead mt-5 max-w-xl">
                Send us your CC&R and bylaws. We load them before the call, so
                the board asks about its own rules and watches the AI cite the answer.
              </p>

              <h2 className="mt-10 text-xl font-semibold tracking-tight text-foreground">What happens next</h2>
              <ol className="mt-5 space-y-5">
                {steps.map((s, i) => (
                  <li key={s.title} className="flex gap-4">
                    <span
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-semibold text-[#fff]"
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-lg font-semibold text-foreground">{s.title}</p>
                      <p className="mt-1 text-base leading-relaxed text-foreground-secondary">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="card mt-10 p-6">
                <p className="text-lg font-semibold text-foreground">Rather look around yourself?</p>
                <p className="mt-2 text-base leading-relaxed text-foreground-secondary">
                  Start the {TRIAL_DAYS}-day free trial, no card needed. Inside the app, the
                  &ldquo;Try it with a sample community&rdquo; button fills a workspace with marked sample data so
                  you can click through before you enter anything real.
                </p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <TrackedLink href={SIGN_UP_URL} event="pilot_cta_click" position="demo_page" className="btn btn-primary btn-lg group !bg-primary !text-[#fff] hover:!bg-primary-hover w-full sm:w-auto">
                    Start free trial
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </TrackedLink>
                  <Link href="/features" className="btn btn-secondary btn-lg w-full !text-foreground sm:w-auto">
                    See what it does
                  </Link>
                </div>
              </div>
            </div>

            <div className="card p-7 shadow-[0_30px_60px_-36px_hsl(var(--foreground)/0.35)] md:p-9 lg:sticky lg:top-24">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Request your demo
              </h2>
              <p className="mt-2 text-base text-foreground-secondary">
                Three required fields. County and number of homes are optional.
              </p>

              <DemoForm />

              {/* 2026-10-19 owner-delegated defaults: no customer quote is
                  verified, so none is shown here. */}
              <ul className="mt-8 space-y-2 text-base text-foreground-secondary">
                {['Citations on every legal answer', 'Board approves every AI draft', 'Your data is yours'].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-surface py-16">
        <div className="container-page">
          <div className="grid gap-6 md:grid-cols-3">
            {/* BL-090: the 40% / 50%+ conversion and "15 min" figures had
                nothing behind them. These are product facts. */}
            <Stat label="Every document answer" value="Cited" sub="Or it says your documents don’t cover it" />
            <Stat label="Every AI draft" value="Approvals" sub="Letters, bills and minutes wait for the board" />
            <Stat label="Setup + roster import" value="Self-serve" sub="CSV or Excel, CINC exports included" />
          </div>
          <p className="mt-10 text-center text-base text-muted">
            HomeownerHub works for an HOA in any state. {STATE_COVERAGE_SENTENCE}{' '}
            Tell us where you are.
          </p>
        </div>
      </section>

      {/* What we will / won't do — sets honest expectations upfront. */}
      <section className="section border-t border-border">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">
              Honest scope
            </p>
            <h2 className="t-h2 mt-4 text-foreground">
              What you get. What we won't pretend.
            </h2>
          </div>
          <div className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-success/70 bg-success-subtle/30 p-7">
              <p className="eyebrow text-success">
                What we do
              </p>
              <ul className="mt-4 space-y-3">
                {[
                  'Answer covenant questions with the exact section cited',
                  'Draft violation notices for board approval',
                  'Draft meeting minutes from your transcript',
                  'Bring in bank feeds and reconcile them to the general ledger',
                  'Read vendor bills into an approvals queue',
                  'Email the board a month-end report on the 1st',
                  'Draft announcements from a sentence, preview them on a phone, and show who opened them',
                  'Turn a resident’s email into a ticket, violation report or ARC link',
                  'Answer residents’ questions in the portal, citing your documents',
                  'Prepare estoppel certificates, collections letters and the owner budget notice',
                ].map((b) => (
                  <li key={b} className="flex gap-2.5 text-base leading-relaxed text-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-border/70 bg-surface p-7">
              <p className="eyebrow text-foreground-secondary">
                What we don't
              </p>
              <ul className="mt-4 space-y-3">
                {[
                  'Send a notice without board approval. The human stays in the loop.',
                  'Replace your attorney. The AI cites; counsel decides.',
                  'Resell your data. It stays in your tenant, RLS-isolated.',
                  'Charge for an integration you never use.',
                  'Charge you during the trial. No card is needed to start.',
                ].map((b) => (
                  <li key={b} className="flex gap-2.5 text-base leading-relaxed text-foreground-secondary">
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ — top objections boards raise before booking. */}
      <section className="section border-t border-border bg-surface">
        <div className="container-page">
          <div className="mx-auto max-w-3xl">
            <div className="text-center">
              <p className="eyebrow">
                Common questions
              </p>
              <h2 className="t-h2 mt-4 text-foreground">
                Before you book the demo.
              </h2>
            </div>
            <dl className="mt-12 divide-y divide-border card">
              {FAQS.map(({ q, a }) => (
                <div key={q} className="px-6 py-6 md:px-8">
                  <dt className="text-[17px] font-semibold text-foreground">{q}</dt>
                  <dd className="mt-2 text-base leading-relaxed text-foreground-secondary">{a}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 text-center text-base text-muted">
              Have a different question? Send it in the form above. We answer
              every demo request within one business day.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container-page">
          <div className="mx-auto max-w-2xl rounded-2xl border border-border/70 bg-surface p-8 text-center ring-card">
            <p className="eyebrow">
              Not ready for a demo?
            </p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              Read the public roadmap.
            </h3>
            <p className="mt-3 text-base leading-relaxed text-foreground-secondary">
              Every workflow&apos;s status and quality bar (A / B / C) is published,
              so you can see what is live and what is not before you commit anything.
            </p>
            <a
              href="/roadmap"
              className="mt-6 inline-flex items-center gap-1.5 text-base font-semibold text-foreground hover:text-primary"
            >
              See the roadmap
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      </main>
    <Footer />
    </>
  )
}

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Will HomeownerHub replace our community manager?',
    a: 'No. HomeownerHub takes over the slow paperwork (covenant lookups, notice drafts, minutes, AR reminders) so your manager or treasurer can spend their time on people. A board with a manager can keep them and use HomeownerHub alongside.',
  },
  {
    q: 'What happens to data we already have?',
    a: 'You upload your CC&R and bylaws as PDFs. We do not need a migration, a service-rep handoff, or integrations to start. Your roster comes over when you are ready: the board uploads a CSV or Excel file (CINC exports are recognised), checks what will happen to every row, then imports. Balances in the file are shown for reference, not posted, and past accounting history is not imported, so you can run both side by side for a month.',
  },
  {
    q: 'How is the AI prevented from making things up?',
    a: 'Every legal answer cites the exact section number it pulled from. If the rule is not in your governing docs, the AI says so. Violation notices ship as drafts the board approves; the AI never sends anything by itself.',
  },
  {
    q: 'What about privacy and data security?',
    a: 'Your association is isolated in Postgres with row-level security, so no other association can read your rows. We do not train on your data. Documents stay in your tenant. Board members can download every record from Settings → Your data at any time, and we delete on request.',
  },
  {
    q: 'What does it cost after the free trial?',
    a: `${HOA_PRICE_COPY.model} ${HOA_PRICE_COPY.summary} It is published on /pricing so the board sees the full picture before the demo. Nothing is charged until the board picks a plan.`,
  },
  {
    q: 'How long until our community is live?',
    a: 'Covenant Brain is answering questions the same day you upload the CC&R. The board can do the rest itself: create the association and open the books from Accounting, import the roster from a spreadsheet, and invite the board. The built-in guide walks each step. How long that takes depends on the state of your records.',
  },
]

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-6">
      <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-base font-medium text-foreground-secondary">{label}</p>
      <p className="mt-1 text-base text-muted">{sub}</p>
    </div>
  )
}
