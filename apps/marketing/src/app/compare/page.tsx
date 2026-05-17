import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Check, X, Minus, Sparkles } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { PageHero } from '@/components/site/page-hero'
import { cn } from '@/lib/cn'

export const metadata: Metadata = {
  title: 'Ledger vs management companies, Vantaca, and DIY',
  description:
    'The honest comparison your board can send around. AI workflows, real pricing, what Ledger does that nobody else does.',
}

type Cell = boolean | 'partial' | string

interface Row {
  label: string
  hh: Cell
  mgmt: Cell
  vantaca: Cell
  diy: Cell
}

const columns = [
  { key: 'hh', name: 'Ledger', sub: 'AI-native, self-managed' },
  { key: 'mgmt', name: 'Management company', sub: 'CCM, Heritage, FirstService' },
  { key: 'vantaca', name: 'Vantaca / AppFolio', sub: 'Enterprise PMS' },
  { key: 'diy', name: 'DIY spreadsheet', sub: 'Google Sheets + email' },
] as const

const cost: Row = {
  label: 'Monthly cost (180 doors)',
  hh: '$79',
  mgmt: '$1,800–$3,500',
  vantaca: '$450–$900',
  diy: '$0',
}

const sections: { title: string; rows: Row[] }[] = [
  {
    title: 'Cost & onboarding',
    rows: [
      cost,
      { label: 'Setup time', hh: '15 minutes', mgmt: '4–6 weeks', vantaca: '2–4 weeks', diy: 'Always ongoing' },
      { label: 'Implementation fee', hh: '$0', mgmt: '$2,500–$10,000', vantaca: '$1,500–$5,000', diy: '$0' },
      { label: 'Free pilot', hh: '6 months', mgmt: false, vantaca: false, diy: 'n/a' },
      { label: 'Annual contract required', hh: false, mgmt: true, vantaca: true, diy: false },
    ],
  },
  {
    title: 'AI workflows',
    rows: [
      { label: 'Covenant Brain (cited answers)', hh: true, mgmt: false, vantaca: false, diy: false },
      { label: 'Violation Drafter (AI-drafted notices)', hh: true, mgmt: 'partial', vantaca: false, diy: false },
      { label: 'Minutes Engine (auto-drafted minutes)', hh: true, mgmt: 'partial', vantaca: false, diy: false },
      { label: 'Reserve Live (real-time projections)', hh: true, mgmt: false, vantaca: 'partial', diy: false },
      { label: 'Multilingual resident comms', hh: true, mgmt: false, vantaca: false, diy: false },
      { label: 'Bar A/B/C quality labels on every workflow', hh: true, mgmt: false, vantaca: false, diy: false },
    ],
  },
  {
    title: 'Trust & governance',
    rows: [
      { label: 'Citations on every legal-adjacent answer', hh: true, mgmt: false, vantaca: false, diy: false },
      { label: 'Audit log on every AI action', hh: true, mgmt: false, vantaca: 'partial', diy: false },
      { label: 'Operating + reserve fund DB-level separation', hh: true, mgmt: 'partial', vantaca: true, diy: false },
      { label: 'GA attorney-reviewed templates (where applicable)', hh: true, mgmt: 'partial', vantaca: false, diy: false },
      { label: 'You own your data — one-click export', hh: true, mgmt: false, vantaca: 'partial', diy: true },
      { label: 'Public roadmap', hh: true, mgmt: false, vantaca: false, diy: 'n/a' },
    ],
  },
  {
    title: 'For volunteer boards',
    rows: [
      { label: 'Mobile-first UX', hh: true, mgmt: 'partial', vantaca: false, diy: 'partial' },
      { label: 'No "implementation team" required', hh: true, mgmt: false, vantaca: false, diy: true },
      { label: 'Built for self-managed (not for management firms)', hh: true, mgmt: false, vantaca: false, diy: true },
      { label: 'Built in Atlanta · supports GA jurisdictions deeply', hh: true, mgmt: 'partial', vantaca: false, diy: false },
    ],
  },
]

function CellIcon({ value }: { value: Cell }) {
  if (value === 'partial') {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-50 text-amber-600 ring-1 ring-amber-100">
        <Minus className="h-4 w-4" />
      </span>
    )
  }
  if (typeof value === 'string') {
    return <span className="text-sm font-medium text-ink-800">{value}</span>
  }
  if (value === true) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
        <Check className="h-4 w-4" />
      </span>
    )
  }
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink-50 text-ink-400 ring-1 ring-ink-200">
      <X className="h-4 w-4" />
    </span>
  )
}

export default function ComparePage() {
  return (
    <main>
      <Nav />

      <PageHero
        eyebrow="Ledger vs the alternatives"
        title={
          <>
            The comparison your board can send around.
          </>
        }
        subtitle="Self-managed HOA boards have three real options: hire a management company, buy enterprise PMS software, or fight a spreadsheet. Here's how Ledger stacks up on each."
      />

      <section className="py-8">
        <div className="container-page">
          <div className="overflow-hidden rounded-2xl border border-ink-200/70 bg-white ring-card">
            <div className="grid grid-cols-[2fr,1fr,1fr,1fr,1fr] border-b border-ink-200/70 bg-ink-50/40">
              <div className="px-5 py-4 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                Capability
              </div>
              {columns.map((c) => (
                <div
                  key={c.key}
                  className={cn(
                    'px-5 py-4 text-center',
                    c.key === 'hh' && 'bg-brand-50/60',
                  )}
                >
                  <p className={cn('text-sm font-semibold', c.key === 'hh' ? 'text-brand-700' : 'text-ink-900')}>
                    {c.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-500">{c.sub}</p>
                </div>
              ))}
            </div>

            {sections.map((s) => (
              <div key={s.title}>
                <div className="border-t border-ink-200/70 bg-ink-50/40 px-5 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700">
                    {s.title}
                  </p>
                </div>
                {s.rows.map((r) => (
                  <div
                    key={r.label}
                    className="grid grid-cols-[2fr,1fr,1fr,1fr,1fr] border-t border-ink-100"
                  >
                    <div className="px-5 py-4 text-sm text-ink-800">{r.label}</div>
                    <div className="flex items-center justify-center bg-brand-50/40 px-5 py-4">
                      <CellIcon value={r.hh} />
                    </div>
                    <div className="flex items-center justify-center px-5 py-4">
                      <CellIcon value={r.mgmt} />
                    </div>
                    <div className="flex items-center justify-center px-5 py-4">
                      <CellIcon value={r.vantaca} />
                    </div>
                    <div className="flex items-center justify-center px-5 py-4">
                      <CellIcon value={r.diy} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="container-page">
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
            <SummaryCard
              title="vs Management company"
              body="A 180-door HOA spends $21,600 to $42,000/year on a management firm. Ledger is $948/year. The math isn't close — and the AI does more of the actual work."
              note="At 180 doors, a single management quote = ~18 months of Ledger."
            />
            <SummaryCard
              title="vs Vantaca / AppFolio"
              body="Enterprise PMS is built for management companies, not boards. You'll spend $5,400–$10,800/year on software your volunteers can't operate, plus the management fee on top."
              note="Vantaca is great if you have an ops team. You don't."
            />
            <SummaryCard
              title="vs the spreadsheet"
              body="Free, but expensive. The reserve fund discrepancy nobody caught for three years, the violation notice that didn't go out, the resident question that took six hours to answer."
              note="The status quo is the most expensive option."
            />
          </div>
        </div>
      </section>

      <section className="bg-ink-50/40 py-20">
        <div className="container-page text-center">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
            Next step
          </p>
          <h2 className="mx-auto mt-3 max-w-2xl text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
            Ten minutes. Your CC&R. Your board.
          </h2>
          <Link
            href="/demo"
            className="mt-7 inline-flex items-center gap-2 rounded-xl bg-ink-900 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-all hover:bg-ink-800 hover:shadow-md"
          >
            Book a demo
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  )
}

function SummaryCard({ title, body, note }: { title: string; body: string; note: string }) {
  return (
    <div className="rounded-2xl border border-ink-200/70 bg-white p-7 ring-card">
      <h3 className="text-lg font-semibold tracking-tight text-ink-900">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-ink-700">{body}</p>
      <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50/40 p-3">
        <p className="text-xs font-medium text-brand-800">{note}</p>
      </div>
    </div>
  )
}
