'use client'

import { motion } from 'framer-motion'
import { ShieldCheck, AlertCircle, BookOpen, Clock } from 'lucide-react'
import { cn } from '@/lib/cn'
import { WORKFLOWS } from '@/lib/workflows'

type Bar = 'C' | 'B' | 'A'

// Rendered from lib/workflows.ts, the same list as /roadmap (BL-042). Live
// workflows first; anything not shipped shows its status, never a bar.
const STATUS_ORDER = { shipped: 0, building: 1, planned: 2 } as const
const workflows = [...WORKFLOWS].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
const liveCount = WORKFLOWS.filter((w) => w.status === 'shipped').length

const barStyle: Record<Bar, { label: string; color: string; Icon: typeof ShieldCheck }> = {
  C: {
    label: 'Bar C · Production',
    color: 'bg-success-subtle text-success ring-success/15',
    Icon: ShieldCheck,
  },
  B: {
    label: 'Bar B · Human-reviewed',
    color: 'bg-warning-subtle text-warning ring-warning/15',
    Icon: AlertCircle,
  },
  A: {
    label: 'Bar A · Demo only',
    color: 'bg-subtle text-foreground-secondary ring-border',
    Icon: BookOpen,
  },
}

export function WorkflowsGrid() {
  return (
    <section className="py-24 md:py-32" id="workflows">
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            {liveCount} live · {WORKFLOWS.length - liveCount} on the roadmap · labeled by quality bar
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            We tell you what's production, what's beta, what's demo, and what isn't built yet.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            Every workflow ships with a quality bar, published here and on the
            public roadmap. No hidden hallucination risk. No "AI did it" deflection.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            <Legend bar="C" />
            <Legend bar="B" />
            <Legend bar="A" />
          </div>
        </div>

        <div className="mt-16 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {workflows.map((w, i) => {
            const live = w.status === 'shipped' && w.bar !== '—'
            const chip = live ? barStyle[w.bar as Bar] : null
            const Icon = chip ? chip.Icon : Clock
            return (
              <motion.div
                key={w.name}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.4, delay: (i % 6) * 0.04 }}
                className={cn(
                  'group rounded-2xl border p-5 transition-all',
                  live
                    ? 'border-border/70 bg-surface hover:border-border-strong ring-card'
                    : 'border-dashed border-border bg-subtle/30',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
                      {w.name}
                    </h3>
                    <p className="mt-1.5 text-xs uppercase tracking-wider text-muted">
                      {w.hub}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1',
                      chip ? chip.color : 'bg-subtle text-muted ring-border',
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {chip ? w.bar : w.status === 'building' ? 'Building' : 'Roadmap'}
                  </span>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-foreground-secondary">
                  {w.description}
                </p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function Legend({ bar }: { bar: Bar }) {
  const s = barStyle[bar]
  const Icon = s.Icon
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1', s.color)}>
      <Icon className="h-3 w-3" />
      {s.label}
    </span>
  )
}
