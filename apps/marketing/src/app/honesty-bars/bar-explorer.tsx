'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldCheck, AlertCircle, BookOpen } from 'lucide-react'
import { WORKFLOWS, type Bar } from '@/lib/workflows'
import { cn } from '@/lib/cn'

interface BarDef {
  bar: 'C' | 'B' | 'A'
  name: string
  Icon: typeof ShieldCheck
  summary: string
  requires: string[]
  chipCls: string
  cardCls: string
  activeCls: string
}

const BARS: BarDef[] = [
  {
    bar: 'C',
    name: 'Production',
    Icon: ShieldCheck,
    summary: 'Works on real customer data. No human gate required.',
    requires: [
      '100+ evaluation cases · >95% accuracy',
      'Human review gate tested in production with feedback loop closed',
      'Zero critical safety issues in 30 days of real use',
      'Legal clearance with revert clause (if legal-adjacent)',
      'Model weights pinned · no retraining in last 14 days',
    ],
    chipCls: 'bg-success-subtle text-success ring-success/15',
    cardCls: 'border-success/60',
    activeCls: 'border-success bg-success-subtle/40',
  },
  {
    bar: 'B',
    name: 'Human-reviewed',
    Icon: AlertCircle,
    summary: 'Works on real customer data. Mandatory human review before send.',
    requires: [
      '50+ evaluation cases · >90% accuracy on blind test set',
      'Citation / audit trail complete — every output traceable',
      'Human review gate implemented and tested (~5 min review)',
      'Legal review (if legal-adjacent) green-lit in writing',
    ],
    chipCls: 'bg-warning-subtle text-warning ring-warning/15',
    cardCls: 'border-warning/60',
    activeCls: 'border-warning bg-warning-subtle/40',
  },
  {
    bar: 'A',
    name: 'Demo only',
    Icon: BookOpen,
    summary: 'Sandbox or watermarked. Not safe for production. Useful for evaluation.',
    requires: [
      'Curated test data only',
      '<80% accuracy acceptable for educational purposes',
      'Watermarked "DEMO ONLY" on every output',
      'Founder + lawyer sign-off (for legal-adjacent demos)',
    ],
    chipCls: 'bg-subtle text-foreground-secondary ring-border',
    cardCls: 'border-border/60',
    activeCls: 'border-muted bg-subtle/40',
  },
]

const barChipMap: Record<Bar, string> = {
  C: 'bg-success-subtle text-success ring-success/15',
  B: 'bg-warning-subtle text-warning ring-warning/15',
  A: 'bg-subtle text-foreground-secondary ring-border',
  '—': 'bg-subtle text-muted ring-border',
}

export function BarExplorer() {
  const [activeBar, setActiveBar] = useState<'C' | 'B' | 'A' | 'all'>('all')

  const filtered = useMemo(() => {
    if (activeBar === 'all') return WORKFLOWS
    return WORKFLOWS.filter((w) => w.bar === activeBar)
  }, [activeBar])

  return (
    <section className="py-12">
      <div className="container-page">
        <div className="mb-6 flex items-center justify-between">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Click a bar to filter the workflow list
          </p>
          {activeBar !== 'all' && (
            <button
              onClick={() => setActiveBar('all')}
              className="font-mono text-[11px] font-semibold uppercase tracking-wider text-primary hover:text-primary"
            >
              Show all bars
            </button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {BARS.map((b) => {
            const isActive = activeBar === b.bar
            return (
              <button
                key={b.bar}
                onClick={() => setActiveBar(isActive ? 'all' : b.bar)}
                className={cn(
                  'rounded-2xl border bg-surface p-6 text-left transition-all',
                  isActive ? b.activeCls : b.cardCls,
                  isActive
                    ? 'ring-2 ring-offset-2 ring-offset-surface'
                    : 'hover:border-border-strong',
                )}
                aria-pressed={isActive}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ring-1',
                      b.chipCls,
                    )}
                  >
                    <b.Icon className="h-3 w-3" />
                    Bar {b.bar}
                  </span>
                  <span className="text-sm font-semibold text-foreground">{b.name}</span>
                </div>
                <p className="mt-5 text-sm font-medium text-foreground">{b.summary}</p>

                <p className="mt-6 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Requires
                </p>
                <ul className="mt-2 space-y-1.5">
                  {b.requires.map((r) => (
                    <li key={r} className="flex gap-2 text-xs leading-relaxed text-foreground-secondary">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted" />
                      {r}
                    </li>
                  ))}
                </ul>

                <p className="mt-6 inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-foreground-secondary">
                  {isActive ? '✓ filtered below' : 'click to filter →'}
                </p>
              </button>
            )
          })}
        </div>

        {/* Workflow list below */}
        <div className="mt-10 rounded-2xl border border-border/70 bg-surface p-6 md:p-8">
          <div className="mb-4 flex items-center justify-between">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              {activeBar === 'all' ? 'All workflows' : `Workflows at Bar ${activeBar}`}
            </p>
            <span className="font-mono text-[11px] text-muted">
              <span className="font-semibold text-foreground">{filtered.length}</span> of {WORKFLOWS.length}
            </span>
          </div>

          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence>
              {filtered.map((w) => (
                <motion.li
                  key={w.id}
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface px-3 py-2.5"
                >
                  <span className="truncate text-sm font-medium text-foreground">{w.name}</span>
                  <span
                    className={cn(
                      'shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ring-1',
                      barChipMap[w.bar],
                    )}
                  >
                    {w.bar}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      </div>
    </section>
  )
}
