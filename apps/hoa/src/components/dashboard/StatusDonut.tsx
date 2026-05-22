'use client'

import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@homeowner-portal/ui'
import type { DonutSegment } from '@/lib/dashboard/charts'

// Six distinct, accessible tones. Hues are spaced ~60° apart on the
// colour wheel so adjacent slices on the donut never read as the same
// colour even for users with mild colour-vision deficiency.
const TONE_FILL: Record<DonutSegment['tone'], string> = {
  primary: '#2563eb',     // blue-600     — open / needs board
  warning: '#f59e0b',     // amber-500    — notice / cure window
  success: '#10b981',     // emerald-500  — cured / positive
  muted: '#64748b',       // slate-500    — resolved / archival
  destructive: '#ef4444', // red-500      — fined / non-compliant
  severe: '#7c3aed',      // violet-600   — escalated / legal
}

interface StatusDonutProps {
  title: string
  segments: DonutSegment[]
  total: number
  emptyTitle?: string
  emptyDescription?: string
  icon?: React.ReactNode
}

export function StatusDonut({
  title,
  segments,
  total,
  emptyTitle = 'No data yet',
  emptyDescription = 'When activity starts the breakdown will show here.',
  icon,
}: StatusDonutProps) {
  // Recompute the chart option only when inputs change. ECharts re-runs
  // the option diff on every render otherwise, which is wasteful.
  const option = useMemo(
    () => ({
      tooltip: {
        trigger: 'item',
        textStyle: { fontSize: 12 },
        borderColor: '#e5e7eb',
        borderWidth: 1,
        padding: [6, 10],
        // value (count) + percentage; matches what recharts showed.
        formatter: '{b}: <b>{c}</b> ({d}%)',
      },
      // Disable the legend — we render our own list to the right of the
      // donut so this stays consistent with the previous design.
      legend: { show: false },
      series: [
        {
          type: 'pie',
          radius: ['60%', '88%'],
          // Smooth out the slice transitions; the rounded corners + small
          // gap between slices match the recharts paddingAngle=1 look.
          itemStyle: { borderColor: '#fff', borderWidth: 1, borderRadius: 2 },
          label: { show: false },
          labelLine: { show: false },
          // Slight rotate so the first (largest) slice starts at 12 o'clock,
          // making the donut feel anchored.
          startAngle: 90,
          data: segments.map((s) => ({
            name: s.label,
            value: s.value,
            itemStyle: { color: TONE_FILL[s.tone] },
          })),
        },
      ],
    }),
    [segments],
  )

  const ariaSummary =
    total === 0
      ? `${title}: no data`
      : `${title}: ${total} total — ${segments
          .map((s) => `${s.value} ${s.label.toLowerCase()}`)
          .join(', ')}`

  return (
    <Card className="h-full">
      <CardHeader className="p-5 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-[200px] items-center p-5 pt-2">
        {total === 0 ? (
          <div className="flex w-full justify-center">
            <EmptyState title={emptyTitle} description={emptyDescription} />
          </div>
        ) : (
          <div
            role="img"
            aria-label={ariaSummary}
            className="grid w-full items-center gap-4 sm:grid-cols-[160px_1fr]"
          >
            <div className="relative h-40">
              <ReactECharts
                option={option}
                style={{ height: '100%', width: '100%' }}
                opts={{ renderer: 'svg' }}
                notMerge
                lazyUpdate
              />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold tabular-nums">{total}</span>
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  total
                </span>
              </div>
            </div>

            <ul className="space-y-1.5 text-sm">
              {segments.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: TONE_FILL[s.tone] }}
                    />
                    <span className="truncate text-muted">{s.label}</span>
                  </span>
                  <span className="font-medium tabular-nums">{s.value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
