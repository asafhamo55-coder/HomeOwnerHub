import type { Metadata } from 'next'
import {
  Calendar,
  FileText,
  Users,
  ShieldCheck,
  ArrowRight,
  Check,
  X,
} from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { HOA_PRICE_COPY } from '@/lib/hoa-pricing'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'
import { STATE_COVERAGE_SENTENCE } from '@/lib/state-law'
import { DemoForm } from './demo-form'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/demo']!, path: '/demo' })

const agenda = [
  {
    Icon: FileText,
    title: 'You send us your CC&R',
    // The form has three text fields and no upload: the PDF comes by email.
    body: 'Fill in the form and reply to our email with the PDF. We load it before the call so the demo runs on your data, not ours.',
  },
  {
    Icon: Users,
    title: 'We show up at your next board meeting',
    body: 'In person in metro Atlanta; by video everywhere else.',
  },
  {
    Icon: Calendar,
    title: 'Board votes at the next meeting',
    body: 'No high-pressure close. Every plan starts with a 30-day free trial, no card needed. Your board decides on its own timeline.',
  },
  {
    Icon: ShieldCheck,
    title: 'No data migration',
    body: 'We don\'t need integrations or a service rep. Start with your documents. When you\'re ready, the board imports its own roster from a spreadsheet and opens the books in Accounting.',
  },
]

export default function DemoPage() {
  return (
    <>
      <Nav />
    <main id="main-content">

      <section className="hero-wash relative overflow-hidden pb-20 pt-28 md:pt-36">
        
        <div className="container-page">
          <div className="grid items-start gap-12 md:grid-cols-[1.05fr,1fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-surface px-3.5 py-1.5 text-xs font-medium text-foreground-secondary ring-soft">
                <Calendar className="h-3.5 w-3.5 text-accent-fg" aria-hidden />
                20 minutes. Your CC&R. Your decision.
              </div>
              <h1 className="mt-6 text-[clamp(2.5rem,1.4rem+2.5vw,3.5rem)] font-medium leading-[1.04] tracking-[-0.035em] text-foreground">
                Send your CC&R today.{' '}
                Demo the board on Tuesday.
              </h1>
              <p className="t-lead mt-5 max-w-xl">
                We pre-load your CC&R and bylaws before the call, so the board
                asks about its own rules and watches the AI cite the answer.
              </p>

              <div className="mt-10 space-y-5">
                {agenda.map((a) => (
                  <div key={a.title} className="flex gap-4">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                      <a.Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{a.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-foreground-secondary">{a.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-7 shadow-[0_30px_60px_-36px_hsl(var(--foreground)/0.35)] md:p-9">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Tell us about your community
              </h2>
              <p className="mt-2 text-sm text-muted">
                Name, email and your HOA. County and number of homes are optional. We reply within 1 business day.
              </p>

              <DemoForm />

              {/* 2026-10-19 owner-delegated defaults: no customer quote is
                  verified, so none is shown here. */}
              <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-medium text-muted">
                <span className="inline-flex items-center gap-1">
                  <span className="h-1 w-1 rounded-full bg-success-solid" />
                  Citations on every legal answer
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-1 w-1 rounded-full bg-success-solid" />
                  Board approves every AI draft
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-1 w-1 rounded-full bg-success-solid" />
                  Your data is yours
                </span>
              </div>
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
          <p className="mt-10 text-center text-sm text-muted">
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
                  <li key={b} className="flex gap-2.5 text-sm leading-relaxed text-foreground">
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
                  <li key={b} className="flex gap-2.5 text-sm leading-relaxed text-foreground-secondary">
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
                  <dd className="mt-2 text-[15px] leading-relaxed text-foreground-secondary">{a}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 text-center text-sm text-muted">
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
            <p className="mt-3 text-sm leading-relaxed text-foreground-secondary">
              Every workflow&apos;s status and quality bar (A / B / C) is published,
              so you can see what is live and what is not before you commit anything.
            </p>
            <a
              href="/roadmap"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary"
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
      <p className="mt-1 text-sm font-medium text-foreground-secondary">{label}</p>
      <p className="mt-1 text-sm text-muted">{sub}</p>
    </div>
  )
}
