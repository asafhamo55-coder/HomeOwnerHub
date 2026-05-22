'use client'

import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
} from '@homeowner-portal/ui'
import type { ActivityBucket } from '@/lib/dashboard/charts'

const SERIES: Array<{
  key: 'violations' | 'arc' | 'invitations'
  label: string
  fill: string
}> = [
  { key: 'violations', label: 'Violations', fill: '#ef4444' },
  { key: 'arc', label: 'ARC submissions', fill: '#2563eb' },
  { key: 'invitations', label: 'Vendor invites', fill: '#10b981' },
]

interface ActivityBarProps {
  buckets: ActivityBucket[]
}

export function ActivityBar({ buckets }: ActivityBarProps) {
  const totals = buckets.reduce(
    (acc, b) => {
      acc.violations += b.violations
      acc.arc += b.arc
      acc.invitations += b.invitations
      return acc
    },
    { violations: 0, arc: 0, invitations: 0 },
  )
  const total = totals.violations + totals.arc + totals.invitations

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        textStyle: { fontSize: 12 },
        borderColor: '#e5e7eb',
        borderWidth: 1,
        padding: [6, 10],
      },
      // Legend is rendered in the header above the chart (matches the
      // prior design), so suppress ECharts' own legend.
      legend: { show: false },
      grid: {
        // Tight margins — matches the recharts version's compact look.
        top: 8,
        right: 8,
        bottom: 20,
        left: 28,
        containLabel: false,
      },
      xAxis: {
        type: 'category',
        // Truncate "YYYY-MM-DD" to "MM-DD" for axis readability.
        data: buckets.map((b) => b.date.slice(5)),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { fontSize: 11, color: '#6b7280' },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#e5e7eb', type: [2, 4] as [number, number] } },
        axisLabel: { fontSize: 11, color: '#6b7280' },
        minInterval: 1,
      },
      series: SERIES.map((s, i) => ({
        name: s.label,
        type: 'bar',
        stack: 'activity',
        itemStyle: {
          color: s.fill,
          // Round the top of the topmost stacked segment only; lower
          // segments stay squared off so the stack reads cleanly.
          borderRadius: i === SERIES.length - 1 ? [2, 2, 0, 0] : 0,
        },
        emphasis: { focus: 'series' },
        data: buckets.map((b) => b[s.key]),
      })),
    }),
    [buckets],
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-5 pb-2">
        <CardTitle className="text-base">Activity — last 30 days</CardTitle>
        {total > 0 ? (
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {SERIES.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: s.fill }}
                />
                <span className="text-muted">{s.label}</span>
                <span className="font-medium tabular-nums text-foreground">
                  {totals[s.key]}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardHeader>
      <CardContent className="p-5 pt-2">
        {total === 0 ? (
          <EmptyState
            title="Quiet month"
            description="No violations, ARC submissions, or vendor invites in the last 30 days."
          />
        ) : (
          <div className="h-56">
            <ReactECharts
              option={option}
              style={{ height: '100%', width: '100%' }}
              opts={{ renderer: 'svg' }}
              notMerge
              lazyUpdate
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
