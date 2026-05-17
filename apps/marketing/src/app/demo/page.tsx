import type { Metadata } from 'next'
import { Calendar, FileText, Users, ShieldCheck, ArrowRight } from 'lucide-react'
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

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-ink-200/70 bg-white p-6 ring-card">
      <p className="text-3xl font-semibold tracking-tight text-ink-900">{value}</p>
      <p className="mt-1 text-sm font-medium text-ink-700">{label}</p>
      <p className="mt-1 text-xs text-ink-500">{sub}</p>
    </div>
  )
}
