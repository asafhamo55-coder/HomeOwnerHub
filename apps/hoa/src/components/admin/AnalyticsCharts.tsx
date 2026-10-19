'use client'

import { useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, useTheme } from '@homeowner-portal/ui'
import { palette } from '@homeowner-portal/ui/tokens'

// Platform-analytics charts (ECharts, SVG renderer). Colours come from the
// design tokens at runtime — the CSS variables the preset emits — so the
// charts follow light/dark mode and the brand instead of hard-coded hex.

type TokenName =
  | 'foreground'
  | 'foreground-secondary'
  | 'muted'
  | 'border'
  | 'surface'
  | 'elevated'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'accent'

const TOKEN_NAMES: TokenName[] = [
  'foreground',
  'foreground-secondary',
  'muted',
  'border',
  'surface',
  'elevated',
  'primary',
  'success',
  'warning',
  'danger',
  'info',
  'accent',
]

type Tokens = Record<TokenName, string>

// Fallbacks for the server render / first paint only: the light HOA
// palette, straight from the token source.
const FALLBACK: Tokens = Object.fromEntries(
  TOKEN_NAMES.map((name) => [name, palette('hoa', 'light')[name]]),
) as Tokens

/** "243 75% 59%" → "hsl(243, 75%, 59%)" (ECharts wants the comma form). */
function toHsl(channels: string): string | null {
  const parts = channels.trim().split(/\s+/)
  if (parts.length < 3) return null
  return `hsl(${parts[0]}, ${parts[1]}, ${parts[2]})`
}

function useChartTokens(): Tokens {
  const { resolved } = useTheme()
  const [tokens, setTokens] = useState<Tokens>(FALLBACK)
  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement)
      const next = { ...FALLBACK }
      for (const name of TOKEN_NAMES) {
        const v = toHsl(style.getPropertyValue(`--${name}`))
        if (v) next[name] = v
      }
      setTokens(next)
    }
    read()
    // The `.dark` class can also flip from the pre-paint script or another
    // tab; watch it directly.
    const obs = new MutationObserver(read)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [resolved])
  return tokens
}

function baseTooltip(t: Tokens) {
  return {
    textStyle: { fontSize: 12, color: t.foreground },
    backgroundColor: t.elevated,
    borderColor: t.border,
    borderWidth: 1,
    padding: [6, 10],
  }
}

function Chart({ option, height }: { option: object; height: number | string }) {
  return (
    <div style={{ height }}>
      <ReactECharts option={option} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'svg' }} notMerge lazyUpdate />
    </div>
  )
}

// ─── Growth Chart (dual-axis: tenants + members over time) ──────────

interface GrowthChartProps {
  tenants: Array<{ month: string; count: number }>
  members: Array<{ month: string; count: number }>
}

export function GrowthChart({ tenants, members }: GrowthChartProps) {
  const t = useChartTokens()
  const option = useMemo(
    () => ({
      tooltip: { trigger: 'axis', ...baseTooltip(t) },
      legend: {
        bottom: 0,
        textStyle: { fontSize: 12, color: t['foreground-secondary'] },
        itemWidth: 12,
        itemHeight: 8,
      },
      grid: { top: 24, right: 40, bottom: 40, left: 40, containLabel: false },
      xAxis: {
        type: 'category',
        data: tenants.map((x) => x.month.slice(5)),
        axisLine: { lineStyle: { color: t.border } },
        axisTick: { show: false },
        axisLabel: { fontSize: 11, color: t.muted },
      },
      yAxis: [
        {
          type: 'value',
          name: 'Tenants',
          nameTextStyle: { fontSize: 11, color: t.muted },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: t.border, type: [2, 4] as [number, number] } },
          axisLabel: { fontSize: 11, color: t.muted },
          minInterval: 1,
        },
        {
          type: 'value',
          name: 'Members',
          nameTextStyle: { fontSize: 11, color: t.muted },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { fontSize: 11, color: t.muted },
          minInterval: 1,
        },
      ],
      series: [
        {
          name: 'Tenants created',
          type: 'bar',
          yAxisIndex: 0,
          barMaxWidth: 28,
          itemStyle: { color: t.primary, borderRadius: [3, 3, 0, 0] },
          data: tenants.map((x) => x.count),
        },
        {
          name: 'Members joined',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { color: t.success, width: 2 },
          itemStyle: { color: t.success },
          data: members.map((m) => m.count),
        },
      ],
    }),
    [tenants, members, t],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Growth</CardTitle>
        <CardDescription>Tenants created and members joined per month, last 12 months</CardDescription>
      </CardHeader>
      <CardContent>
        <Chart option={option} height="16rem" />
      </CardContent>
    </Card>
  )
}

// ─── Feature Adoption Bar ───────────────────────────────────────────

interface FeatureAdoptionProps {
  features: Array<{ feature: string; tenants_using: number; total_tenants: number }>
}

export function FeatureAdoptionChart({ features }: FeatureAdoptionProps) {
  const t = useChartTokens()
  const option = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        ...baseTooltip(t),
        formatter: (params: Array<{ dataIndex: number; name: string; value: number }>) => {
          const d = params[0]
          if (!d) return ''
          const total = features[features.length - 1 - d.dataIndex]?.total_tenants ?? 0
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
          return `${d.name}<br/><b>${d.value}</b> / ${total} tenants (${pct}%)`
        },
      },
      grid: { top: 4, right: 40, bottom: 4, left: 4, containLabel: true },
      xAxis: { type: 'value', show: false, minInterval: 1 },
      yAxis: {
        type: 'category',
        data: features.map((f) => f.feature).reverse(),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { fontSize: 12, color: t['foreground-secondary'] },
      },
      series: [
        {
          type: 'bar',
          data: [...features].reverse().map((f) => f.tenants_using),
          itemStyle: { color: t.primary, borderRadius: [0, 3, 3, 0] },
          barMaxWidth: 18,
          label: {
            show: true,
            position: 'right',
            fontSize: 11,
            color: t.muted,
            formatter: (params: { dataIndex: number }) => {
              const f = features[features.length - 1 - params.dataIndex]
              if (!f || f.total_tenants === 0) return '0%'
              return `${Math.round((f.tenants_using / f.total_tenants) * 100)}%`
            },
          },
        },
      ],
    }),
    [features, t],
  )

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle as="h2">Feature adoption</CardTitle>
        <CardDescription>Share of tenants using each feature</CardDescription>
      </CardHeader>
      <CardContent>
        {features.length === 0 ? (
          <EmptyState variant="compact" title="No feature data yet" />
        ) : (
          <Chart option={option} height={Math.max(features.length * 30 + 8, 120)} />
        )}
      </CardContent>
    </Card>
  )
}

// ─── Donuts ─────────────────────────────────────────────────────────

interface Segment {
  key: string
  label: string
  value: number
  color: string
}

function Donut({ title, description, segments, emptyTitle }: { title: string; description: string; segments: Segment[]; emptyTitle: string }) {
  const t = useChartTokens()
  const total = segments.reduce((n, s) => n + s.value, 0)
  const option = useMemo(
    () => ({
      tooltip: { trigger: 'item', ...baseTooltip(t), formatter: '{b}: <b>{c}</b> ({d}%)' },
      legend: { show: false },
      series: [
        {
          type: 'pie',
          radius: ['62%', '88%'],
          itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 3 },
          label: { show: false },
          labelLine: { show: false },
          startAngle: 90,
          data: segments.map((s) => ({ name: s.label, value: s.value, itemStyle: { color: s.color } })),
        },
      ],
    }),
    [segments, t],
  )

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle as="h2">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {/* The legend sits beside the donut only when the CARD has room for
          it (cq-sm), not the viewport: at 1440 three donuts share a row and
          each card is ~20rem, too narrow for 9rem of donut plus labels
          (BL-066). minmax(0,1fr) + min-w-0 let long labels truncate instead
          of widening the grid past the card. */}
      <CardContent className="cq">
        {total === 0 ? (
          <EmptyState variant="compact" title={emptyTitle} />
        ) : (
          <div className="grid grid-cols-1 items-center gap-5 cq-sm:grid-cols-[9rem_minmax(0,1fr)]">
            <div className="relative mx-auto size-36" aria-hidden>
              <Chart option={option} height="100%" />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="num text-2xl font-semibold text-foreground">{total.toLocaleString()}</span>
                <span className="text-xs text-muted">total</span>
              </div>
            </div>
            <ul className="min-w-0 space-y-2 text-sm">
              {segments.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                    <span className="truncate text-foreground-secondary">{s.label}</span>
                  </span>
                  <span className="num shrink-0 whitespace-nowrap font-medium text-foreground">
                    {s.value.toLocaleString()}{' '}
                    <span className="font-normal text-muted">({Math.round((s.value / total) * 100)}%)</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const VIOLATION_STATUS: Record<string, { label: string; token: TokenName }> = {
  open: { label: 'Open', token: 'info' },
  notice_sent: { label: 'Notice sent', token: 'warning' },
  cured: { label: 'Cured', token: 'success' },
  resolved: { label: 'Resolved', token: 'muted' },
  fined: { label: 'Fined', token: 'danger' },
  escalated: { label: 'Escalated', token: 'primary' },
}

export function ViolationsDonut({ data }: { data: Array<{ status: string; count: number }> }) {
  const t = useChartTokens()
  const segments = data
    .filter((d) => d.count > 0)
    .map((d) => {
      const meta = VIOLATION_STATUS[d.status]
      return {
        key: d.status,
        label: meta?.label ?? d.status.replace(/_/g, ' '),
        value: d.count,
        color: t[meta?.token ?? 'muted'],
      }
    })
  return <Donut title="Violations" description="All tenants, by status" segments={segments} emptyTitle="No violations recorded" />
}

export function VendorComplianceDonut({ data }: { data: { green: number; yellow: number; red: number; missing: number } }) {
  const t = useChartTokens()
  const segments: Segment[] = [
    { key: 'green', label: 'Compliant', value: data.green, color: t.success },
    { key: 'yellow', label: 'Expiring soon', value: data.yellow, color: t.warning },
    { key: 'red', label: 'Non-compliant', value: data.red, color: t.danger },
    { key: 'missing', label: 'Docs missing', value: data.missing, color: t.muted },
  ].filter((s) => s.value > 0)
  return <Donut title="Vendor compliance" description="Certificates of insurance, all tenants" segments={segments} emptyTitle="No vendor data yet" />
}

// ─── Workflow Usage Chart ───────────────────────────────────────────

export function WorkflowUsageChart({ workflows }: { workflows: Array<{ workflow_id: string; runs: number }> }) {
  const t = useChartTokens()
  const top = useMemo(() => workflows.slice(0, 10), [workflows])
  const option = useMemo(
    () => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, ...baseTooltip(t) },
      grid: { top: 4, right: 40, bottom: 4, left: 4, containLabel: true },
      xAxis: { type: 'value', show: false, minInterval: 1 },
      yAxis: {
        type: 'category',
        data: top.map((w) => w.workflow_id).reverse(),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          fontSize: 11,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          color: t['foreground-secondary'],
          formatter: (v: string) => (v.length > 26 ? `${v.slice(0, 24)}…` : v),
        },
      },
      series: [
        {
          type: 'bar',
          data: [...top].reverse().map((w) => w.runs),
          itemStyle: { color: t.primary, borderRadius: [0, 3, 3, 0] },
          barMaxWidth: 18,
          label: { show: true, position: 'right', fontSize: 11, color: t.muted },
        },
      ],
    }),
    [top, t],
  )

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle as="h2">AI workflow usage</CardTitle>
        <CardDescription>Runs per workflow, last 30 days</CardDescription>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <EmptyState variant="compact" title="No AI runs in the last 30 days" />
        ) : (
          <Chart option={option} height={Math.max(top.length * 30 + 8, 120)} />
        )}
      </CardContent>
    </Card>
  )
}
