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
    body: 'We don\'t need integrations or a service rep. The doc upload is the implementation.',
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
              <div className="inline-flex items-center gap-2 rounded-full border border-ink-200/70 bg-white px-3.5 py-1.5 text-xs font-medium text-ink-700 ring-soft">
                <Calendar className="h-3.5 w-3.5 text-ember-500" />
                10 minutes. Your CC&R. Your decision.
              </div>
              <h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight text-ink-900 md:text-6xl">
                Send your CC&R today.{' '}
                Demo the board on Tuesday.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-500">
                We pre-load your CC&R and bylaws before the call. By minute 4,
                the board is asking their own rules and watching the AI cite the
                answer.
              </p>

              <div className="mt-10 space-y-5">
                {agenda.map((a) => (
                  <div key={a.title} className="flex gap-4">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                      <a.Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink-900">{a.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-ink-600">{a.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-ink-200/70 bg-white p-8 ring-card">
              <h2 className="text-xl font-semibold tracking-tight text-ink-900">
                Tell us about your community
              </h2>
              <p className="mt-2 text-sm text-ink-500">
                Three fields. We reply within one business day.
              </p>

              <DemoForm />

              <div className="mt-8 rounded-xl border border-ink-200/70 bg-ink-50/40 p-4">
                <div className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-ember-500 text-xs font-semibold text-white">
                    LJ
                  </div>
                  <div>
                    <p className="text-xs leading-relaxed text-ink-700">
                      "Ten minutes is all it took. The board voted yes that night."
                    </p>
                    <p className="mt-1 text-[11px] text-ink-500">
                      Linda Jackson · Madison Park HOA · 180 doors
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-medium text-ink-500">
                <span className="inline-flex items-center gap-1">
                  <span className="h-1 w-1 rounded-full bg-emerald-500" />
                  Citations on every legal answer
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-1 w-1 rounded-full bg-emerald-500" />
                  GA attorney-reviewed
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-1 w-1 rounded-full bg-emerald-500" />
                  Your data is yours
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-ink-200/60 bg-ink-50/40 py-16">
        <div className="container-page">
          <div className="grid gap-6 md:grid-cols-3">
            <Stat label="Demo → pilot conversion" value="40%" sub="Across Atlanta-metro HOAs" />
            <Stat label="Pilot → paid conversion" value="50%+" sub="At six-month review" />
            <Stat label="From upload to first cited answer" value="15 min" sub="Madison Park onboarding" />
          </div>
          <p className="mt-10 text-center text-xs text-ink-500">
            Ledger serves Atlanta-metro HOAs in v1. Charlotte / Raleigh /
            Nashville / Tampa / Orlando are coming. Tell us where you are.
          </p>
        </div>
      </section>

      {/* What we will / won't do — sets honest expectations upfront. */}
      <section className="border-t border-ink-200/60 py-20">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
              Honest scope
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
              What you get. What we won't pretend.
            </h2>
          </div>
          <div className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/30 p-7">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                What we do
              </p>
              <ul className="mt-4 space-y-3">
                {[
                  'Answer covenant questions with the exact section cited',
                  'Draft violation notices for board approval',
                  'Generate meeting minutes the same night',
                  'Reconcile bank feeds to the GL automatically',
                  'Show resident-facing rule lookups in plain English',
                ].map((b) => (
                  <li key={b} className="flex gap-2.5 text-sm leading-relaxed text-ink-800">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-ink-200/70 bg-white p-7">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-700">
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
                  <li key={b} className="flex gap-2.5 text-sm leading-relaxed text-ink-700">
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ — top objections boards raise before booking. */}
      <section className="border-t border-ink-200/60 bg-ink-50/40 py-20">
        <div className="container-page">
          <div className="mx-auto max-w-3xl">
            <div className="text-center">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
                Common questions
              </p>
              <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
                Before you book the demo.
              </h2>
            </div>
            <dl className="mt-12 divide-y divide-ink-200/70 rounded-2xl border border-ink-200/70 bg-white">
              {FAQS.map(({ q, a }) => (
                <div key={q} className="px-6 py-6 md:px-8">
                  <dt className="text-base font-semibold text-ink-900">{q}</dt>
                  <dd className="mt-2 text-sm leading-relaxed text-ink-600">{a}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 text-center text-xs text-ink-500">
              Have a different question? Send it in the form above. We answer
              every demo request within one business day.
            </p>
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="container-page">
          <div className="mx-auto max-w-2xl rounded-2xl border border-ink-200/70 bg-white p-8 text-center ring-card">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">
              Not ready for a demo?
            </p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-ink-900">
              Read the public roadmap.
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-ink-600">
              Every workflow's quality bar (A / B / C) is published, auto-updated
              from the workflows directory, and visible before you commit anything.
            </p>
            <a
              href="/roadmap"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-900 hover:text-brand-700"
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
    q: 'Will Ledger replace our community manager?',
    a: 'No. Ledger replaces the slow paperwork — covenant lookups, notice drafts, minutes, AR reminders — so your manager (or your treasurer) has time for the human work. Most boards keep their manager and use Ledger to give them leverage.',
  },
  {
    q: 'What happens to data we already have?',
    a: 'You upload your CC&R and bylaws as PDFs. We do not need a migration, a service-rep handoff, or integrations to start. Your roster, GL, and history can come over when you are ready — most boards run in parallel for the first month.',
  },
  {
    q: 'How is the AI prevented from making things up?',
    a: 'Every legal answer cites the exact section number it pulled from. If the rule is not in your governing docs, the AI says so. Violation notices ship as drafts the board approves; the AI never sends anything by itself.',
  },
  {
    q: 'What about privacy and data security?',
    a: 'Your tenant is RLS-isolated in Postgres — no other association can read your rows. We do not train on your data. Documents stay in your tenant; you can export or delete on request.',
  },
  {
    q: 'What does it cost after the six-month pilot?',
    a: 'Pricing is per-door, billed annually, no per-feature add-ons. We publish the bands on /pricing before the demo so the board sees the full picture upfront. No auto-conversion — you opt in.',
  },
  {
    q: 'How long until our community is live?',
    a: 'Covenant Brain is answering questions the same day you upload the CC&R. Full onboarding (resident roster, GL setup, vendor list) usually takes one to two weeks of part-time work, depending on the state of your records.',
  },
]

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-ink-200/70 bg-white p-6 ring-card">
      <p className="text-3xl font-semibold tracking-tight text-ink-900">{value}</p>
      <p className="mt-1 text-sm font-medium text-ink-700">{label}</p>
      <p className="mt-1 text-xs text-ink-500">{sub}</p>
    </div>
  )
}
