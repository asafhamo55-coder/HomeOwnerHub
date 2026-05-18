'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
} from '@homeowner-portal/ui'
import type { ActivityBucket } from '@/lib/dashboard/charts'

const TICK_STYLE = { fontSize: 11, fill: '#6b7280' }

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

  // Truncate "YYYY-MM-DD" to "MM-DD" for axis readability.
  const formatted = buckets.map((b) => ({
    ...b,
    short: b.date.slice(5),
  }))

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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={formatted} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="short"
                  tick={TICK_STYLE}
                  interval="preserveStartEnd"
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={TICK_STYLE}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: '#e5e7eb' }}
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                />
                {SERIES.map((s) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    stackId="a"
                    fill={s.fill}
                    name={s.label}
                    radius={[2, 2, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
