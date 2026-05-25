'use client'

import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'

// ─── Growth Chart (dual-axis: tenants + members over time) ──────────

interface GrowthChartProps {
  tenants: Array<{ month: string; count: number }>
  members: Array<{ month: string; count: number }>
}

export function GrowthChart({ tenants, members }: GrowthChartProps) {
  const option = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
        textStyle: { fontSize: 12 },
        borderColor: '#e5e7eb',
        borderWidth: 1,
        padding: [6, 10],
      },
      legend: {
        bottom: 0,
        textStyle: { fontSize: 11, color: '#6b7280' },
        itemWidth: 12,
        itemHeight: 8,
      },
      grid: { top: 16, right: 48, bottom: 36, left: 48, containLabel: false },
      xAxis: {
        type: 'category',
        data: tenants.map((t) => t.month.slice(5)),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { fontSize: 11, color: '#6b7280' },
      },
      yAxis: [
        {
          type: 'value',
          name: 'Tenants',
          nameTextStyle: { fontSize: 10, color: '#6b7280' },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: '#e5e7eb', type: [2, 4] as [number, number] } },
          axisLabel: { fontSize: 11, color: '#6b7280' },
          minInterval: 1,
        },
        {
          type: 'value',
          name: 'Members',
          nameTextStyle: { fontSize: 10, color: '#6b7280' },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { fontSize: 11, color: '#6b7280' },
          minInterval: 1,
        },
      ],
      series: [
        {
          name: 'Tenants created',
          type: 'bar',
          yAxisIndex: 0,
          itemStyle: { color: '#2563eb', borderRadius: [2, 2, 0, 0] },
          data: tenants.map((t) => t.count),
        },
        {
          name: 'Members joined',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { color: '#10b981', width: 2 },
          itemStyle: { color: '#10b981' },
          data: members.map((m) => m.count),
        },
      ],
    }),
    [tenants, members],
  )

  return (
    <Card>
      <CardHeader className="p-5 pb-2">
        <CardTitle className="text-base">Growth — last 12 months</CardTitle>
      </CardHeader>
      <CardContent className="p-5 pt-2">
        <div className="h-64">
          <ReactECharts
            option={option}
            style={{ height: '100%', width: '100%' }}
            opts={{ renderer: 'svg' }}
            notMerge
            lazyUpdate
          />
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Feature Adoption Bar ───────────────────────────────────────────

interface FeatureAdoptionProps {
  features: Array<{ feature: string; tenants_using: number; total_tenants: number }>
}

export function FeatureAdoptionChart({ features }: FeatureAdoptionProps) {
  const option = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        textStyle: { fontSize: 12 },
        borderColor: '#e5e7eb',
        borderWidth: 1,
        padding: [6, 10],
        formatter: (params: any) => {
          const d = params[0]
          const total = features[d.dataIndex]?.total_tenants ?? 0
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
          return `${d.name}<br/><b>${d.value}</b> / ${total} tenants (${pct}%)`
        },
      },
      grid: { top: 8, right: 16, bottom: 4, left: 8, containLabel: true },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#e5e7eb', type: [2, 4] as [number, number] } },
        axisLabel: { fontSize: 11, color: '#6b7280' },
        minInterval: 1,
      },
      yAxis: {
        type: 'category',
        data: features.map((f) => f.feature).reverse(),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { fontSize: 12, color: '#374151' },
      },
      series: [
        {
          type: 'bar',
          data: [...features].reverse().map((f) => f.tenants_using),
          itemStyle: {
            color: '#7c3aed',
            borderRadius: [0, 3, 3, 0],
          },
          barMaxWidth: 28,
          label: {
            show: true,
            position: 'right',
            fontSize: 11,
            color: '#6b7280',
            formatter: (params: any) => {
              const idx = features.length - 1 - params.dataIndex
              const f = features[idx]
              if (!f || f.total_tenants === 0) return '0%'
              return `${Math.round((f.tenants_using / f.total_tenants) * 100)}%`
            },
          },
        },
      ],
    }),
    [features],
  )

  return (
    <Card>
      <CardHeader className="p-5 pb-2">
        <CardTitle className="text-base">Feature adoption</CardTitle>
      </CardHeader>
      <CardContent className="p-5 pt-2">
        <div className="h-56">
          <ReactECharts
            option={option}
            style={{ height: '100%', width: '100%' }}
            opts={{ renderer: 'svg' }}
            notMerge
            lazyUpdate
          />
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Violations Breakdown Donut ─────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  open: '#2563eb',
  notice_sent: '#f59e0b',
  cured: '#10b981',
  resolved: '#64748b',
  fined: '#ef4444',
  escalated: '#7c3aed',
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  notice_sent: 'Notice sent',
  cured: 'Cured',
  resolved: 'Resolved',
  fined: 'Fined',
  escalated: 'Escalated',
}

interface ViolationsDonutProps {
  data: Array<{ status: string; count: number }>
}

export function ViolationsDonut({ data }: ViolationsDonutProps) {
  const total = data.reduce((acc, d) => acc + d.count, 0)

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: 'item',
        textStyle: { fontSize: 12 },
        borderColor: '#e5e7eb',
        borderWidth: 1,
        padding: [6, 10],
        formatter: '{b}: <b>{c}</b> ({d}%)',
      },
      legend: { show: false },
      series: [
        {
          type: 'pie',
          radius: ['58%', '85%'],
          itemStyle: { borderColor: '#fff', borderWidth: 1, borderRadius: 2 },
          label: { show: false },
          labelLine: { show: false },
          startAngle: 90,
          data: data.map((d) => ({
            name: STATUS_LABELS[d.status] ?? d.status,
            value: d.count,
            itemStyle: { color: STATUS_COLORS[d.status] ?? '#94a3b8' },
          })),
        },
      ],
    }),
    [data],
  )

  return (
    <Card className="h-full">
      <CardHeader className="p-5 pb-2">
        <CardTitle className="text-base">Violations breakdown</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-[200px] items-center p-5 pt-2">
        {total === 0 ? (
          <p className="w-full text-center text-sm text-muted">No violations recorded.</p>
        ) : (
          <div className="grid w-full items-center gap-4 sm:grid-cols-[160px_1fr]">
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
              {data.map((d) => (
                <li key={d.status} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: STATUS_COLORS[d.status] ?? '#94a3b8' }}
                    />
                    <span className="truncate text-muted">{STATUS_LABELS[d.status] ?? d.status}</span>
                  </span>
                  <span className="font-medium tabular-nums">{d.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Vendor Compliance Donut ────────────────────────────────────────

interface VendorComplianceDonutProps {
  data: { green: number; yellow: number; red: number; missing: number }
}

const COMPLIANCE_CONFIG = [
  { key: 'green' as const, label: 'Compliant', color: '#10b981' },
  { key: 'yellow' as const, label: 'Action soon', color: '#f59e0b' },
  { key: 'red' as const, label: 'Non-compliant', color: '#ef4444' },
  { key: 'missing' as const, label: 'Docs missing', color: '#64748b' },
]

export function VendorComplianceDonut({ data }: VendorComplianceDonutProps) {
  const total = data.green + data.yellow + data.red + data.missing

  const segments = COMPLIANCE_CONFIG.filter((c) => data[c.key] > 0)

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: 'item',
        textStyle: { fontSize: 12 },
        borderColor: '#e5e7eb',
        borderWidth: 1,
        padding: [6, 10],
        formatter: '{b}: <b>{c}</b> ({d}%)',
      },
      legend: { show: false },
      series: [
        {
          type: 'pie',
          radius: ['58%', '85%'],
          itemStyle: { borderColor: '#fff', borderWidth: 1, borderRadius: 2 },
          label: { show: false },
          labelLine: { show: false },
          startAngle: 90,
          data: segments.map((s) => ({
            name: s.label,
            value: data[s.key],
            itemStyle: { color: s.color },
          })),
        },
      ],
    }),
    [data, segments],
  )

  return (
    <Card className="h-full">
      <CardHeader className="p-5 pb-2">
        <CardTitle className="text-base">Vendor compliance</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-[200px] items-center p-5 pt-2">
        {total === 0 ? (
          <p className="w-full text-center text-sm text-muted">No vendor data yet.</p>
        ) : (
          <div className="grid w-full items-center gap-4 sm:grid-cols-[160px_1fr]">
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
                <li key={s.key} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: s.color }}
                    />
                    <span className="truncate text-muted">{s.label}</span>
                  </span>
                  <span className="font-medium tabular-nums">{data[s.key]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Workflow Usage Chart ───────────────────────────────────────────

interface WorkflowUsageProps {
  workflows: Array<{ workflow_id: string; runs: number }>
}

export function WorkflowUsageChart({ workflows }: WorkflowUsageProps) {
  const top = workflows.slice(0, 10)
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
      grid: { top: 8, right: 16, bottom: 4, left: 8, containLabel: true },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#e5e7eb', type: [2, 4] as [number, number] } },
        axisLabel: { fontSize: 11, color: '#6b7280' },
        minInterval: 1,
      },
      yAxis: {
        type: 'category',
        data: top.map((w) => w.workflow_id).reverse(),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { fontSize: 11, color: '#374151', formatter: (v: string) => v.length > 24 ? v.slice(0, 22) + '...' : v },
      },
      series: [
        {
          type: 'bar',
          data: [...top].reverse().map((w) => w.runs),
          itemStyle: { color: '#2563eb', borderRadius: [0, 3, 3, 0] },
          barMaxWidth: 24,
          label: { show: true, position: 'right', fontSize: 11, color: '#6b7280' },
        },
      ],
    }),
    [top],
  )

  return (
    <Card>
      <CardHeader className="p-5 pb-2">
        <CardTitle className="text-base">AI workflow usage — 30 days</CardTitle>
      </CardHeader>
      <CardContent className="p-5 pt-2">
        {top.length === 0 ? (
          <p className="text-sm text-muted">No AI workflow runs in the last 30 days.</p>
        ) : (
          <div style={{ height: Math.max(top.length * 32 + 16, 120) }}>
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
