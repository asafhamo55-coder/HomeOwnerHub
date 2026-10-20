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
import { DemoForm } from './demo-form'

export const metadata: Metadata = {
  title: 'Book a demo — 10 minutes for your board',
  description:
    'Send us your CC&R. We pre-load it. We show Covenant Brain answering your actual rules. Your board decides.',
}

const agenda = [
  {
    Icon: FileText,
    title: 'You send us your CC&R',
    body: 'Drop a PDF in the form. We ingest it before the call so the demo runs on your data, not ours.',
  },
  {
    Icon: Users,
    title: 'We show up at your next board meeting',
    body: 'In person with printed one-pagers for each member. Atlanta-metro only in v1; video for everyone else.',
  },
  {
    Icon: Calendar,
    title: 'Board votes at the next meeting',
    body: 'No high-pressure close. Six months free pilot, no auto-conversion. Your board decides on their own timeline.',
  },
  {
    Icon: ShieldCheck,
    title: 'No data migration',
    body: 'We don\'t need integrations or a service rep. Start with your documents. When you\'re ready, the board imports its own roster from a spreadsheet and opens the books in Accounting.',
  },
]

export default function DemoPage() {
  return (
    <main>
      <Nav />

      <section className="relative overflow-hidden pt-32 pb-16">
        <div className="absolute inset-0 -z-10 bg-radial-spot" />
        <div className="container-page">
          <div className="grid items-start gap-12 md:grid-cols-[1.05fr,1fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-surface px-3.5 py-1.5 text-xs font-medium text-foreground-secondary ring-soft">
                <Calendar className="h-3.5 w-3.5 text-accent-fg" />
                10 minutes. Your CC&R. Your decision.
              </div>
              <h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight text-foreground md:text-6xl">
                Send your CC&R today.{' '}
                Demo the board on Tuesday.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
                We pre-load your CC&R and bylaws before the call. By minute 4,
                the board is asking their own rules and watching the AI cite the
                answer.
              </p>

              <div className="mt-10 space-y-5">
                {agenda.map((a) => (
                  <div key={a.title} className="flex gap-4">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                      <a.Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{a.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-foreground-secondary">{a.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-surface p-8 ring-card">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Tell us about your community
              </h2>
              <p className="mt-2 text-sm text-muted">
                Three fields. We reply within one business day.
              </p>

              <DemoForm />

              {/* 2026-10-19 owner-delegated defaults: no customer quote is
                  verified, so none is shown here. */}
              <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-medium text-muted">
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

      <section className="border-t border-border/60 bg-subtle/40 py-16">
        <div className="container-page">
          <div className="grid gap-6 md:grid-cols-3">
            {/* BL-090: the 40% / 50%+ conversion and "15 min" figures had
                nothing behind them. These are product facts. */}
            <Stat label="Every document answer" value="Cited" sub="Or it says your documents don’t cover it" />
            <Stat label="Every AI draft" value="Approvals" sub="Letters, bills and minutes wait for the board" />
            <Stat label="Setup + roster import" value="Self-serve" sub="CSV or Excel, CINC exports included" />
          </div>
          <p className="mt-10 text-center text-xs text-muted">
            HomeownerHub serves Atlanta-metro HOAs in v1. Charlotte / Raleigh /
            Nashville / Tampa / Orlando are coming. Tell us where you are.
          </p>
        </div>
      </section>

      {/* What we will / won't do — sets honest expectations upfront. */}
      <section className="border-t border-border/60 py-20">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Honest scope
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              What you get. What we won't pretend.
            </h2>
          </div>
          <div className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-success/70 bg-success-subtle/30 p-7">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-success">
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
                  'Show resident-facing rule lookups in plain English',
                ].map((b) => (
                  <li key={b} className="flex gap-2.5 text-sm leading-relaxed text-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-border/70 bg-surface p-7">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground-secondary">
                What we don't
              </p>
              <ul className="mt-4 space-y-3">
                {[
                  'Send a notice without board approval. The human stays in the loop.',
                  'Replace your attorney. The AI cites; counsel decides.',
                  'Resell your data. It stays in your tenant, RLS-isolated.',
                  'Charge for an integration you never use.',
                  'Auto-convert your pilot. You opt in, every time.',
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
      <section className="border-t border-border/60 bg-subtle/40 py-20">
        <div className="container-page">
          <div className="mx-auto max-w-3xl">
            <div className="text-center">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                Common questions
              </p>
              <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                Before you book the demo.
              </h2>
            </div>
            <dl className="mt-12 divide-y divide-border/70 rounded-2xl border border-border/70 bg-surface">
              {FAQS.map(({ q, a }) => (
                <div key={q} className="px-6 py-6 md:px-8">
                  <dt className="text-base font-semibold text-foreground">{q}</dt>
                  <dd className="mt-2 text-sm leading-relaxed text-foreground-secondary">{a}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 text-center text-xs text-muted">
              Have a different question? Send it in the form above. We answer
              every demo request within one business day.
            </p>
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="container-page">
          <div className="mx-auto max-w-2xl rounded-2xl border border-border/70 bg-surface p-8 text-center ring-card">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
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

      <Footer />
    </main>
  )
}

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Will HomeownerHub replace our community manager?',
    a: 'No. HomeownerHub replaces the slow paperwork — covenant lookups, notice drafts, minutes, AR reminders — so your manager (or your treasurer) has time for the human work. A board with a manager can keep them and use HomeownerHub alongside.',
  },
  {
    q: 'What happens to data we already have?',
    a: 'You upload your CC&R and bylaws as PDFs. We do not need a migration, a service-rep handoff, or integrations to start. Your roster comes over when you are ready: the board uploads a CSV or Excel file (CINC exports are recognised), checks what will happen to every row, then imports. Balances in the file are shown for reference, not posted, and past accounting history is not imported — most boards run in parallel for the first month.',
  },
  {
    q: 'How is the AI prevented from making things up?',
    a: 'Every legal answer cites the exact section number it pulled from. If the rule is not in your governing docs, the AI says so. Violation notices ship as drafts the board approves; the AI never sends anything by itself.',
  },
  {
    q: 'What about privacy and data security?',
    a: 'Your tenant is RLS-isolated in Postgres — no other association can read your rows. We do not train on your data. Documents stay in your tenant. Board members can download every record from Settings → Your data at any time, and we delete on request.',
  },
  {
    q: 'What does it cost after the six-month pilot?',
    a: `Pricing is per door with no per-feature add-ons: ${HOA_PRICE_COPY.summary} It is published on /pricing so the board sees the full picture before the demo. No auto-conversion — you opt in.`,
  },
  {
    q: 'How long until our community is live?',
    a: 'Covenant Brain is answering questions the same day you upload the CC&R. The board can do the rest itself: create the association and open the books from Accounting, import the roster from a spreadsheet, and invite the board. The built-in guide walks each step. How long that takes depends on the state of your records.',
  },
]

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-surface p-6 ring-card">
      <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-sm font-medium text-foreground-secondary">{label}</p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </div>
  )
}
