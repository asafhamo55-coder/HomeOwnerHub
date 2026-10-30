import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldCheck, AlertCircle, BookOpen, ArrowRight } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { WORKFLOWS, BAR_TARGETS, type Bar } from '@/lib/workflows'
import { RoadmapTable } from './roadmap-table'
import { cn } from '@/lib/cn'
import { pageMetadata } from '@/lib/site'
import { PAGE_META } from '@/lib/page-meta'

export const metadata: Metadata = pageMetadata({ ...PAGE_META['/roadmap']!, path: '/roadmap' })

const barIcon: Record<Bar, typeof ShieldCheck> = {
  C: ShieldCheck,
  B: AlertCircle,
  A: BookOpen,
  '—': BookOpen,
}

const barColor: Record<Bar, string> = {
  C: 'bg-success-subtle text-success ring-success/15',
  B: 'bg-warning-subtle text-warning ring-warning/15',
  A: 'bg-subtle text-foreground-secondary ring-border',
  '—': 'bg-subtle text-muted ring-border',
}

export default function RoadmapPage() {
  const shipped = WORKFLOWS.filter((w) => w.status === 'shipped').length
  const building = WORKFLOWS.filter((w) => w.status === 'building').length
  const planned = WORKFLOWS.filter((w) => w.status === 'planned').length

  return (
    <>
      <Nav />
    <main id="main-content">

      <section className="relative overflow-hidden pt-32 pb-12">
        <div className="absolute inset-0 -z-10 bg-radial-spot" />
        <div className="container-page text-center">
          <p className="eyebrow text-primary">
            Public roadmap
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-balance text-4xl font-semibold tracking-tight text-foreground md:text-[56px] md:leading-[1.05]">
            Every workflow. Every bar. In public.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted">
            We publish what each workflow can and can't do today. Quality bar
            labels are published here and across this site.
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
          <div className="rounded-2xl border border-border/70 bg-surface p-6 ring-card md:p-8">
            <h2 className="text-base font-semibold text-foreground">What the bars mean</h2>
            <p className="mt-2 text-sm text-foreground-secondary">
              Every workflow ships at a labeled quality bar, published on this
              site.
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {(['C', 'B', 'A'] as const).map((b) => {
                const Icon = barIcon[b]
                return (
                  <div
                    key={b}
                    className="rounded-xl border border-border/70 bg-subtle/40 p-5"
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
                      <span className="text-sm font-semibold text-foreground">
                        {BAR_TARGETS[b].name}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-foreground-secondary">
                      {BAR_TARGETS[b].threshold}
                    </p>
                  </div>
                )
              })}
            </div>
            <p className="mt-6 text-sm text-muted">
              Movement between bars (A → B → C) needs a human review gate and
              passing tests, and every move is published here.{' '}
              <Link href="/honesty-bars" className="font-semibold text-foreground underline-offset-4 hover:underline">
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
              <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                All {WORKFLOWS.length} workflows
              </h2>
              <p className="mt-3 text-base leading-relaxed text-muted">
                Filter by hub, bar, or status. This list changes in the same
                release as the workflow it describes.
              </p>
            </div>
          </div>

          <RoadmapTable />

          <div className="mt-16 rounded-2xl border border-border/70 bg-gradient-to-br from-primary-subtle via-surface to-accent-subtle/40 p-8 text-center ring-card">
            <h3 className="text-xl font-semibold tracking-tight text-foreground">
              Want input on what we build next?
            </h3>
            <p className="mx-auto mt-2 max-w-lg text-sm text-foreground-secondary">
              Tell us what your board needs next. We read every request.
            </p>
            <Link
              href="/demo"
              className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-fg shadow-sm transition-all hover:bg-primary-hover"
            >
              Book a demo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      </main>
    <Footer />
    </>
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
    emerald: 'border-success/25 bg-success-subtle/40',
    amber: 'border-warning/25 bg-warning-subtle/40',
    slate: 'border-border bg-subtle/40',
  }[tone]
  return (
    <div className={cn('rounded-2xl border bg-surface p-6 text-left', colors)}>
      <p className="text-4xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-2 text-sm font-semibold text-foreground-secondary">{label}</p>
      <p className="mt-1 text-sm text-muted">{sub}</p>
    </div>
  )
}
