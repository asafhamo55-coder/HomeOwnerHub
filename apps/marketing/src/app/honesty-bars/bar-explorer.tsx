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
    chipCls: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    cardCls: 'border-emerald-200/60',
    activeCls: 'border-emerald-500 bg-emerald-50/40',
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
    chipCls: 'bg-amber-50 text-amber-700 ring-amber-100',
    cardCls: 'border-amber-200/60',
    activeCls: 'border-amber-500 bg-amber-50/40',
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
    chipCls: 'bg-slate-50 text-slate-700 ring-slate-200',
    cardCls: 'border-slate-200/60',
    activeCls: 'border-slate-500 bg-slate-50/40',
  },
]

const barChipMap: Record<Bar, string> = {
  C: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  B: 'bg-amber-50 text-amber-700 ring-amber-100',
  A: 'bg-slate-50 text-slate-700 ring-slate-200',
  '—': 'bg-slate-50 text-slate-500 ring-slate-200',
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
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
            Click a bar to filter the workflow list
          </p>
          {activeBar !== 'all' && (
            <button
              onClick={() => setActiveBar('all')}
              className="font-mono text-[11px] font-semibold uppercase tracking-wider text-brand-700 hover:text-brand-800"
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
                  'rounded-2xl border bg-white p-6 text-left transition-all',
                  isActive ? b.activeCls : b.cardCls,
                  isActive
                    ? 'ring-2 ring-offset-2 ring-offset-white'
                    : 'hover:border-ink-300',
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
                  <span className="text-sm font-semibold text-ink-900">{b.name}</span>
                </div>
                <p className="mt-5 text-sm font-medium text-ink-800">{b.summary}</p>

                <p className="mt-6 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                  Requires
                </p>
                <ul className="mt-2 space-y-1.5">
                  {b.requires.map((r) => (
                    <li key={r} className="flex gap-2 text-xs leading-relaxed text-ink-600">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-ink-400" />
                      {r}
                    </li>
                  ))}
                </ul>

                <p className="mt-6 inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-700">
                  {isActive ? '✓ filtered below' : 'click to filter →'}
                </p>
              </button>
            )
          })}
        </div>

        {/* Workflow list below */}
        <div className="mt-10 rounded-2xl border border-ink-200/70 bg-white p-6 md:p-8">
          <div className="mb-4 flex items-center justify-between">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">
              {activeBar === 'all' ? 'All workflows' : `Workflows at Bar ${activeBar}`}
            </p>
            <span className="font-mono text-[11px] text-ink-500">
              <span className="font-semibold text-ink-900">{filtered.length}</span> of {WORKFLOWS.length}
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
                  className="flex items-center justify-between gap-3 rounded-xl border border-ink-200/70 bg-white px-3 py-2.5"
                >
                  <span className="truncate text-sm font-medium text-ink-900">{w.name}</span>
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
