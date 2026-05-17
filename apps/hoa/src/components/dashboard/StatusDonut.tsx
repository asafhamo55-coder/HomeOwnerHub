'use client'

import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@homeowner-portal/ui'
import type { DonutSegment } from '@/lib/dashboard/charts'

const TONE_FILL: Record<DonutSegment['tone'], string> = {
  success: '#10b981', // emerald-500
  warning: '#f59e0b', // amber-500
  destructive: '#ef4444', // red-500
  muted: '#9ca3af', // gray-400
  primary: '#2563eb', // blue-600
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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          <div className="grid items-center gap-4 sm:grid-cols-[160px_1fr]">
            <div className="relative h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={segments}
                    dataKey="value"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={1}
                    strokeWidth={0}
                  >
                    {segments.map((s, i) => (
                      <Cell key={`${s.label}-${i}`} fill={TONE_FILL[s.tone]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 6,
                      borderColor: '#e5e7eb',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold tabular-nums">{total}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted">
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
