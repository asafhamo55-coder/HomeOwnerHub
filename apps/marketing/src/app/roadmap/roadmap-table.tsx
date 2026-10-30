'use client'

import { useMemo, useState } from 'react'
import { m as motionEl, AnimatePresence } from 'framer-motion'
import { ShieldCheck, AlertCircle, BookOpen } from 'lucide-react'
import { WORKFLOWS, type Bar, type Hub, type Status } from '../../lib/workflows'
import { cn } from '../../lib/cn'
import { OTHER_HUBS_ENABLED } from '../../lib/hubs'

const months = ['M1', 'M2', 'M3', 'M4', 'M5-6', 'M7+'] as const

const monthLabel: Record<(typeof months)[number], string> = {
  M1: 'Month 1: Pillars',
  M2: 'Month 2: HOA core',
  M3: OTHER_HUBS_ENABLED ? 'Month 3: PM + financial' : 'Month 3: Financial',
  M4: OTHER_HUBS_ENABLED ? 'Month 4: Eviction + launch' : 'Month 4: Launch',
  'M5-6': 'Months 5–6: Stabilize',
  'M7+': 'Months 7+: Scale',
}

const statusStyle: Record<Status, { label: string; cls: string }> = {
  shipped: { label: 'Shipped', cls: 'bg-success-subtle text-success ring-success/15' },
  building: { label: 'Building', cls: 'bg-warning-subtle text-warning ring-warning/15' },
  planned: { label: 'Planned', cls: 'bg-subtle text-foreground-secondary ring-border' },
}

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

const hubColor: Record<Hub, string> = {
  HOA: 'text-success',
  PM: 'text-accent-fg',
  Eviction: 'text-eviction',
  All: 'text-primary',
  Build: 'text-muted',
}

const HUB_FILTERS: { value: Hub | 'all'; label: string }[] = [
  { value: 'all', label: 'All hubs' },
  { value: 'HOA', label: 'HOA' },
  // BL-097: PM and Eviction are not offered right now.
  ...(OTHER_HUBS_ENABLED
    ? ([
        { value: 'PM', label: 'PM' },
        { value: 'Eviction', label: 'Eviction' },
      ] as const)
    : []),
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
      <div className="rounded-2xl border border-border/70 bg-surface p-4 md:p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <FilterGroup label="Hub" options={HUB_FILTERS} value={hub} onChange={setHub} />
          <FilterGroup label="Bar" options={BAR_FILTERS} value={bar} onChange={setBar} />
          <FilterGroup label="Status" options={STATUS_FILTERS} value={status} onChange={setStatus} />
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3">
          <p className="font-mono text-sm text-muted">
            <span className="font-semibold text-foreground">{filtered.length}</span> of{' '}
            <span className="font-semibold text-foreground">{WORKFLOWS.length}</span> workflows
          </p>
          {isFiltered && (
            <button
              onClick={() => {
                setHub('all')
                setBar('all')
                setStatus('all')
              }}
              className="font-mono text-[11px] font-semibold uppercase tracking-wider text-primary hover:text-primary"
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
              <motionEl.div
                key={m}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <div className="mb-4 flex items-baseline gap-3">
                  <h3 className="font-mono text-sm font-semibold text-primary">{m}</h3>
                  <span className="text-sm font-semibold text-foreground">{monthLabel[m]}</span>
                  <span className="font-mono text-xs text-muted">
                    {rows.length} workflow{rows.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="overflow-hidden rounded-2xl border border-border/70 bg-surface">
                  <table className="block w-full sm:table">
                    <thead className="hidden border-b border-border/70 bg-subtle/40 text-left sm:table-header-group">
                      <tr>
                        <th className="px-5 py-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Workflow
                        </th>
                        <th className="px-5 py-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Hub
                        </th>
                        <th className="px-5 py-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Bar
                        </th>
                        <th className="px-5 py-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="block divide-y divide-border sm:table-row-group">
                      {rows.map((w) => {
                        const Icon = barIcon[w.bar]
                        return (
                          <tr key={w.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 transition-colors hover:bg-subtle/40 sm:table-row sm:px-0 sm:py-0">
                            <td className="basis-full sm:table-cell sm:px-5 sm:py-4">
                              <p className="text-sm font-semibold text-foreground">{w.name}</p>
                              <p className="mt-1 text-sm leading-relaxed text-muted">
                                {w.description}
                              </p>
                            </td>
                            <td
                              className={cn(
                                'align-top font-mono text-xs sm:table-cell sm:px-5 sm:py-4 font-semibold uppercase tracking-wider',
                                hubColor[w.hub],
                              )}
                            >
                              {w.hub}
                            </td>
                            <td className="align-top sm:table-cell sm:px-5 sm:py-4">
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
                            <td className="align-top sm:table-cell sm:px-5 sm:py-4">
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
              </motionEl.div>
            )
          })}
        </AnimatePresence>

        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface p-12 text-center">
            <p className="text-sm text-muted">No workflows match these filters.</p>
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
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
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
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-surface text-foreground-secondary hover:border-border-strong hover:bg-subtle',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
