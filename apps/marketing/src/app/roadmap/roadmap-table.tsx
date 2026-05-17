'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldCheck, AlertCircle, BookOpen } from 'lucide-react'
import { WORKFLOWS, type Bar, type Hub, type Status } from '@/lib/workflows'
import { cn } from '@/lib/cn'

const months = ['M1', 'M2', 'M3', 'M4', 'M5-6', 'M7+'] as const

const monthLabel: Record<(typeof months)[number], string> = {
  M1: 'Month 1 — Pillars',
  M2: 'Month 2 — HOA core',
  M3: 'Month 3 — PM + financial',
  M4: 'Month 4 — Eviction + launch',
  'M5-6': 'Months 5–6 — Stabilize',
  'M7+': 'Months 7+ — Scale',
}

const statusStyle: Record<Status, { label: string; cls: string }> = {
  shipped: { label: 'Shipped', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  building: { label: 'Building', cls: 'bg-amber-50 text-amber-700 ring-amber-100' },
  planned: { label: 'Planned', cls: 'bg-slate-50 text-slate-700 ring-slate-200' },
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

const hubColor: Record<Hub, string> = {
  HOA: 'text-emerald-700',
  PM: 'text-ember-700',
  Eviction: 'text-violet-700',
  All: 'text-brand-700',
  Build: 'text-ink-500',
}

const HUB_FILTERS: { value: Hub | 'all'; label: string }[] = [
  { value: 'all', label: 'All hubs' },
  { value: 'HOA', label: 'HOA' },
  { value: 'PM', label: 'PM' },
  { value: 'Eviction', label: 'Eviction' },
]

const BAR_FILTERS: { value: Bar | 'all'; label: string }[] = [
  { value: 'all', label: 'All bars' },
  { value: 'C', label: 'Bar C · Production' },
  { value: 'B', label: 'Bar B · Reviewed' },
  { value: 'A', label: 'Bar A · Demo' },
]

const STATUS_FILTERS: { value: Status | 'all'; label: string }[] = [
  { value: 'all', label: 'All status' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'building', label: 'Building' },
  { value: 'planned', label: 'Planned' },
]

export function RoadmapTable() {
  const [hub, setHub] = useState<Hub | 'all'>('all')
  const [bar, setBar] = useState<Bar | 'all'>('all')
  const [status, setStatus] = useState<Status | 'all'>('all')

  const filtered = useMemo(() => {
    return WORKFLOWS.filter((w) => {
      if (hub !== 'all' && w.hub !== hub && !(hub === 'HOA' && w.hub === 'All')) return false
      if (bar !== 'all' && w.bar !== bar) return false
      if (status !== 'all' && w.status !== status) return false
      return true
    })
  }, [hub, bar, status])

  const isFiltered = hub !== 'all' || bar !== 'all' || status !== 'all'

  return (
    <div>
      {/* Filter bar */}
      <div className="rounded-2xl border border-ink-200/70 bg-white p-4 md:p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <FilterGroup label="Hub" options={HUB_FILTERS} value={hub} onChange={setHub} />
          <FilterGroup label="Bar" options={BAR_FILTERS} value={bar} onChange={setBar} />
          <FilterGroup label="Status" options={STATUS_FILTERS} value={status} onChange={setStatus} />
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-ink-200/70 pt-3">
          <p className="font-mono text-[11px] text-ink-500">
            <span className="font-semibold text-ink-900">{filtered.length}</span> of{' '}
            <span className="font-semibold text-ink-900">{WORKFLOWS.length}</span> workflows
          </p>
          {isFiltered && (
            <button
              onClick={() => {
                setHub('all')
                setBar('all')
                setStatus('all')
              }}
              className="font-mono text-[11px] font-semibold uppercase tracking-wider text-brand-700 hover:text-brand-800"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      <div className="mt-10 space-y-10">
        <AnimatePresence>
          {months.map((m) => {
            const rows = filtered.filter((w) => w.month === m)
            if (rows.length === 0) return null
            return (
              <motion.div
                key={m}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <div className="mb-4 flex items-baseline gap-3">
                  <h3 className="font-mono text-sm font-semibold text-brand-700">{m}</h3>
                  <span className="text-sm font-semibold text-ink-900">{monthLabel[m]}</span>
                  <span className="font-mono text-xs text-ink-400">
                    {rows.length} workflow{rows.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="overflow-hidden rounded-2xl border border-ink-200/70 bg-white">
                  <table className="w-full">
                    <thead className="border-b border-ink-200/70 bg-ink-50/40 text-left">
                      <tr>
                        <th className="px-5 py-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                          Workflow
                        </th>
                        <th className="px-5 py-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                          Hub
                        </th>
                        <th className="px-5 py-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                          Bar
                        </th>
                        <th className="px-5 py-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {rows.map((w) => {
                        const Icon = barIcon[w.bar]
                        return (
                          <tr key={w.id} className="transition-colors hover:bg-ink-50/40">
                            <td className="px-5 py-4">
                              <p className="text-sm font-semibold text-ink-900">{w.name}</p>
                              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                                {w.description}
                              </p>
                            </td>
                            <td
                              className={cn(
                                'px-5 py-4 align-top font-mono text-xs font-semibold uppercase tracking-wider',
                                hubColor[w.hub],
                              )}
                            >
                              {w.hub}
                            </td>
                            <td className="px-5 py-4 align-top">
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ring-1',
                                  barColor[w.bar],
                                )}
                              >
                                <Icon className="h-3 w-3" />
                                Bar {w.bar}
                              </span>
                            </td>
                            <td className="px-5 py-4 align-top">
                              <span
                                className={cn(
                                  'inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ring-1',
                                  statusStyle[w.status].cls,
                                )}
                              >
                                {statusStyle[w.status].label}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>

        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-ink-300 bg-white p-12 text-center">
            <p className="text-sm text-ink-500">No workflows match these filters.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function FilterGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div>
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-md border px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors',
              value === o.value
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400 hover:bg-ink-50',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
