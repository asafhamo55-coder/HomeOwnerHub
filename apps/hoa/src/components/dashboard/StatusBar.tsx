'use client'

import ReactECharts from 'echarts-for-react'
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@homeowner-portal/ui'
import type { DonutSegment } from '@/lib/dashboard/charts'

const TONE_FILL: Record<DonutSegment['tone'], string> = {
  primary: '#2563eb',
  warning: '#f59e0b',
  success: '#10b981',
  muted: '#64748b',
  destructive: '#ef4444',
  severe: '#7c3aed',
}

interface StatusBarProps {
  title: string
  segments: DonutSegment[]
  total: number
  emptyTitle?: string
  emptyDescription?: string
  icon?: React.ReactNode
}

export function StatusBar({
  title,
  segments,
  total,
  emptyTitle,
  emptyDescription,
  icon,
}: StatusBarProps) {
  if (total === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <EmptyState
            icon={icon}
            title={emptyTitle ?? 'No data'}
            description={emptyDescription}
          />
        </CardContent>
      </Card>
    )
  }

  const categories = segments.map((s) => s.label)
  const values = segments.map((s) => s.value)
  const colors = segments.map((s) => TONE_FILL[s.tone] ?? TONE_FILL.muted)

  const option = {
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      formatter: (params: Array<{ name: string; value: number }>) => {
        const p = params[0]
        return `${p.name}: ${p.value}`
      },
    },
    grid: { left: 8, right: 24, top: 8, bottom: 0, containLabel: true },
    xAxis: {
      type: 'value' as const,
      splitLine: { show: false },
      axisLabel: { show: false },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    yAxis: {
      type: 'category' as const,
      data: categories,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        fontSize: 11,
        color: '#64748b',
      },
    },
    series: [
      {
        type: 'bar' as const,
        data: values.map((v, i) => ({
          value: v,
          itemStyle: { color: colors[i], borderRadius: [0, 4, 4, 0] },
        })),
        barMaxWidth: 20,
        label: {
          show: true,
          position: 'right' as const,
          fontSize: 11,
          color: '#475569',
        },
      },
    ],
  }

  const height = Math.max(140, segments.length * 32 + 24)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
          <span className="ml-auto text-xs font-normal text-muted">{total} total</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ReactECharts option={option} style={{ height }} opts={{ renderer: 'svg' }} />
      </CardContent>
    </Card>
  )
}
