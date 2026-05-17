import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldCheck, AlertCircle, BookOpen, ArrowRight } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { WORKFLOWS, BAR_TARGETS, type Bar } from '@/lib/workflows'
import { RoadmapTable } from './roadmap-table'
import { cn } from '@/lib/cn'

export const metadata: Metadata = {
  title: 'Roadmap — Every workflow, every bar, in public',
  description:
    'The public Ledger roadmap. All 17 workflows with their current quality bar, shipped/building/planned status, and target month.',
}

const barIcon: Record<Bar, typeof ShieldCheck> = {
  C: ShieldCheck,
  B: AlertCircle,
  A: BookOpen,
  '—': BookOpen,
}

const barColor: Record<Bar, string> = {
  C: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  B: 'bg-amber-50 text-amber-700 ring-amber-100',
  A: 'bg-slate-50 text-slate-700 ring-slate-200',
  '—': 'bg-slate-50 text-slate-500 ring-slate-200',
}

export default function RoadmapPage() {
  const shipped = WORKFLOWS.filter((w) => w.status === 'shipped').length
  const building = WORKFLOWS.filter((w) => w.status === 'building').length
  const planned = WORKFLOWS.filter((w) => w.status === 'planned').length

  return (
    <main>
      <Nav />

      <section className="relative overflow-hidden pt-32 pb-12">
        <div className="absolute inset-0 -z-10 bg-radial-spot" />
        <div className="container-page text-center">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
            Public roadmap · updated weekly
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-balance text-4xl font-semibold tracking-tight text-ink-900 md:text-[56px] md:leading-[1.05]">
            Every workflow. Every bar. In public.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-500">
            We publish what each workflow can and can't do today. Quality bar
            labels are visible in the product, in pricing, and here.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <Stat label="Shipped" value={shipped} sub="Production or beta" tone="emerald" />
            <Stat label="Building" value={building} sub="In active development" tone="amber" />
            <Stat label="Planned" value={planned} sub="Scoped, not started" tone="slate" />
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="container-page">
          <div className="rounded-2xl border border-ink-200/70 bg-white p-6 ring-card md:p-8">
            <h2 className="text-base font-semibold text-ink-900">What the bars mean</h2>
            <p className="mt-2 text-sm text-ink-600">
              Every workflow ships at a labeled quality bar. The label is
              visible everywhere — in the UI, in marketing, in pricing.
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {(['C', 'B', 'A'] as const).map((b) => {
                const Icon = barIcon[b]
                return (
                  <div
                    key={b}
                    className="rounded-xl border border-ink-200/70 bg-ink-50/40 p-5"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1',
                          barColor[b],
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        Bar {b}
                      </span>
                      <span className="text-sm font-semibold text-ink-900">
                        {BAR_TARGETS[b].name}
                      </span>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-ink-600">
                      {BAR_TARGETS[b].threshold}
                    </p>
                  </div>
                )
              })}
            </div>
            <p className="mt-6 text-xs text-ink-500">
              Movement between bars (A → B → C) requires an internal eval pass
              and, for legal-adjacent workflows, written attorney sign-off. The
              audit log records every move with approver and date.{' '}
              <Link href="/honesty-bars" className="font-semibold text-ink-800 underline-offset-4 hover:underline">
                Read the full bar policy →
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section className="pb-24">
        <div className="container-page">
          <div className="mb-10 md:flex md:items-end md:justify-between md:gap-12">
            <div className="max-w-xl">
              <h2 className="text-balance text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
                All 17 workflows
              </h2>
              <p className="mt-3 text-base leading-relaxed text-ink-500">
                Filter by hub, bar, or status. Updates land here within 24 hours
                of a bar move in production.
              </p>
            </div>
          </div>

          <RoadmapTable />

          <div className="mt-16 rounded-2xl border border-ink-200/70 bg-gradient-to-br from-brand-50 via-white to-ember-50/40 p-8 text-center ring-card">
            <h3 className="text-xl font-semibold tracking-tight text-ink-900">
              Want input on what we build next?
            </h3>
            <p className="mx-auto mt-2 max-w-lg text-sm text-ink-600">
              Customer advisory board meets monthly. Three to four customers help
              us prioritize. Spots are open.
            </p>
            <Link
              href="/demo"
              className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-ink-800"
            >
              Book a demo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: number
  sub: string
  tone: 'emerald' | 'amber' | 'slate'
}) {
  const colors = {
    emerald: 'border-emerald-200 bg-emerald-50/40',
    amber: 'border-amber-200 bg-amber-50/40',
    slate: 'border-slate-200 bg-slate-50/40',
  }[tone]
  return (
    <div className={cn('rounded-2xl border bg-white p-6 text-left', colors)}>
      <p className="text-4xl font-semibold tracking-tight text-ink-900">{value}</p>
      <p className="mt-2 text-sm font-semibold text-ink-700">{label}</p>
      <p className="mt-1 text-xs text-ink-500">{sub}</p>
    </div>
  )
}
