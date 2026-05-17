'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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

interface ActivityBarProps {
  buckets: ActivityBucket[]
}

export function ActivityBar({ buckets }: ActivityBarProps) {
  const total = buckets.reduce(
    (acc, b) => acc + b.violations + b.arc + b.invitations,
    0,
  )

  // Truncate "YYYY-MM-DD" to "MM-DD" for axis readability.
  const formatted = buckets.map((b) => ({
    ...b,
    short: b.date.slice(5),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity — last 30 days</CardTitle>
      </CardHeader>
      <CardContent>
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
                  interval={Math.max(2, Math.floor(formatted.length / 8))}
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
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Bar dataKey="violations" stackId="a" fill="#ef4444" name="Violations" radius={[2, 2, 0, 0]} />
                <Bar dataKey="arc" stackId="a" fill="#2563eb" name="ARC submissions" radius={[2, 2, 0, 0]} />
                <Bar dataKey="invitations" stackId="a" fill="#10b981" name="Vendor invites" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
