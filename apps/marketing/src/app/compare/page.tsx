import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Check, X, Minus, Sparkles } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { PageHero } from '@/components/site/page-hero'
import { cn } from '@/lib/cn'
import { HOA_PRICE_COPY, annualBillUsd, formatUsd, monthlyBillUsd } from '@/lib/hoa-pricing'

export const metadata: Metadata = {
  title: 'HomeownerHub vs management companies, Vantaca, and DIY',
  description:
    'The comparison your board can send around: AI workflows, HomeownerHub’s checkout price, and what the alternatives publish.',
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
  { key: 'hh', name: 'HomeownerHub', sub: 'AI-native, self-managed' },
  { key: 'mgmt', name: 'Management company', sub: 'A firm runs it for you' },
  { key: 'vantaca', name: 'Vantaca', sub: 'Software for management firms' },
  { key: 'diy', name: 'DIY spreadsheet', sub: 'Google Sheets + email' },
] as const

// HomeownerHub's price at 180 doors comes from lib/hoa-pricing.ts (what checkout
// charges).
//
// Truth rule (BL-002, BL-042, BL-090): a HomeownerHub cell claims only what
// apps/hoa does today. A competitor cell says only what
// docs/research/2026-10-competitors.md sources; anything it doesn't is
// 'Not public' or 'Varies', never an invented number or a guessed X.
// Vantaca's AI (document Q&A, ARC review, meeting summaries, inspections)
// is sourced there, so it gets the check it has earned.
const DOORS = 180
const hhMonthly = monthlyBillUsd(DOORS)
const hhAnnual = annualBillUsd(DOORS)

const cost: Row = {
  label: `Monthly cost (${DOORS} doors)`,
  hh: formatUsd(hhMonthly, { withCents: true }),
  mgmt: 'Quoted per firm',
  vantaca: 'Custom quote',
  diy: '$0',
}

const sections: { title: string; rows: Row[] }[] = [
  {
    title: 'Cost & onboarding',
    rows: [
      cost,
      { label: 'Setup', hh: 'Self-serve: create the HOA, import the roster, open the books', mgmt: 'Onboarded by the firm', vantaca: 'Implementation project', diy: 'Always ongoing' },
      { label: 'Setup fee', hh: '$0', mgmt: 'Varies', vantaca: 'Not public', diy: '$0' },
      { label: 'Free pilot or trial', hh: '6 months', mgmt: 'Varies', vantaca: false, diy: 'n/a' },
      { label: 'Contract term', hh: HOA_PRICE_COPY.contractShort, mgmt: 'Varies', vantaca: 'Not public', diy: 'None' },
    ],
  },
  {
    title: 'AI workflows',
    rows: [
      { label: 'Cited answers from your governing documents', hh: true, mgmt: false, vantaca: true, diy: false },
      { label: 'AI-drafted violation letters, approved by the board', hh: true, mgmt: false, vantaca: 'Not public', diy: false },
      { label: 'AI meeting minutes', hh: 'From your transcript', mgmt: false, vantaca: true, diy: false },
      { label: 'AI ARC review against your guidelines', hh: true, mgmt: false, vantaca: true, diy: false },
      { label: 'Spanish version of announcements', hh: 'Board-reviewed AI draft', mgmt: false, vantaca: 'Not public', diy: false },
      { label: 'Reserve fund projections', hh: 'Roadmap', mgmt: 'Varies', vantaca: 'Not public', diy: false },
      { label: 'Published A/B/C quality bar for every AI workflow', hh: true, mgmt: 'n/a', vantaca: 'Not public', diy: 'n/a' },
    ],
  },
  {
    title: 'Trust & governance',
    rows: [
      { label: 'Document and state-law answers cite their source', hh: true, mgmt: 'n/a', vantaca: 'Not public', diy: false },
      { label: 'AI drafts wait for board approval', hh: true, mgmt: 'n/a', vantaca: true, diy: 'n/a' },
      { label: 'Every journal entry balances per fund (operating, reserve)', hh: true, mgmt: 'Varies', vantaca: 'Not public', diy: false },
      { label: 'Download every record yourself, any time', hh: 'One zip of spreadsheets', mgmt: 'Varies', vantaca: 'Not public', diy: true },
      { label: 'Public roadmap', hh: true, mgmt: 'n/a', vantaca: 'Not public', diy: 'n/a' },
    ],
  },
  {
    title: 'For volunteer boards',
    rows: [
      { label: 'Mobile inspection mode', hh: true, mgmt: 'n/a', vantaca: true, diy: false },
      { label: 'No "implementation team" required', hh: true, mgmt: 'n/a', vantaca: false, diy: true },
      { label: 'Built for self-managed boards (not for management firms)', hh: true, mgmt: false, vantaca: false, diy: true },
      { label: 'State-law answers with statute citations', hh: 'Georgia', mgmt: 'n/a', vantaca: false, diy: false },
    ],
  },
]

function CellIcon({ value }: { value: Cell }) {
  if (value === 'partial') {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-warning-subtle text-warning ring-1 ring-warning/15">
        <Minus className="h-4 w-4" />
      </span>
    )
  }
  if (typeof value === 'string') {
    return <span className="text-sm font-medium text-foreground">{value}</span>
  }
  if (value === true) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-success-subtle text-success ring-1 ring-success/15">
        <Check className="h-4 w-4" />
      </span>
    )
  }
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-subtle text-muted ring-1 ring-border">
      <X className="h-4 w-4" />
    </span>
  )
}

export default function ComparePage() {
  return (
    <main>
      <Nav />

      <PageHero
        eyebrow="HomeownerHub vs the alternatives"
        title={
          <>
            The comparison your board can send around.
          </>
        }
        subtitle="Self-managed HOA boards have three real options: hire a management company, buy software built for management firms, or fight a spreadsheet. Here's how HomeownerHub stacks up on each. Where a competitor doesn't publish something, we say so."
      />

      <section className="py-8">
        <div className="container-page">
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-surface ring-card">
            <div className="grid grid-cols-[2fr,1fr,1fr,1fr,1fr] border-b border-border/70 bg-subtle/40">
              <div className="px-5 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted">
                Capability
              </div>
              {columns.map((c) => (
                <div
                  key={c.key}
                  className={cn(
                    'px-5 py-4 text-center',
                    c.key === 'hh' && 'bg-primary-subtle/60',
                  )}
                >
                  <p className={cn('text-sm font-semibold', c.key === 'hh' ? 'text-primary' : 'text-foreground')}>
                    {c.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">{c.sub}</p>
                </div>
              ))}
            </div>

            {sections.map((s) => (
              <div key={s.title}>
                <div className="border-t border-border/70 bg-subtle/40 px-5 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                    {s.title}
                  </p>
                </div>
                {s.rows.map((r) => (
                  <div
                    key={r.label}
                    className="grid grid-cols-[2fr,1fr,1fr,1fr,1fr] border-t border-border"
                  >
                    <div className="px-5 py-4 text-sm text-foreground">{r.label}</div>
                    <div className="flex items-center justify-center bg-primary-subtle/40 px-5 py-4">
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
              body={`A management firm does the paperwork for a fee it quotes you. HomeownerHub is ${formatUsd(hhAnnual)} a year for a ${DOORS}-door HOA on the annual plan. The board still does the governing; the AI drafts the paperwork.`}
              note={`${formatUsd(hhMonthly)} a month on the monthly plan. Put your firm's quote next to it.`}
            />
            <SummaryCard
              title="vs Vantaca"
              body="Vantaca is built for management companies, sold by custom quote with no trial. Its AI is real, but it is sold to firms with an operations team, not to volunteer boards."
              note="Great if you have an ops team. Most self-managed boards don't."
            />
            <SummaryCard
              title="vs the spreadsheet"
              body="Free, but expensive in volunteer hours: the reconciliation nobody had time for, the violation notice that didn't go out, the resident question that sat in someone's inbox."
              note="The status quo is the most expensive option."
            />
          </div>
        </div>
      </section>

      <section className="bg-subtle/40 py-20">
        <div className="container-page text-center">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Next step
          </p>
          <h2 className="mx-auto mt-3 max-w-2xl text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Ten minutes. Your CC&R. Your board.
          </h2>
          <Link
            href="/demo"
            className="mt-7 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-primary-fg shadow-sm transition-all hover:bg-primary-hover hover:shadow-md"
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
    <div className="rounded-2xl border border-border/70 bg-surface p-7 ring-card">
      <h3 className="text-lg font-semibold tracking-tight text-foreground">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-foreground-secondary">{body}</p>
      <div className="mt-5 rounded-xl border border-primary/25 bg-primary-subtle/40 p-3">
        <p className="text-xs font-medium text-primary">{note}</p>
      </div>
    </div>
  )
}
