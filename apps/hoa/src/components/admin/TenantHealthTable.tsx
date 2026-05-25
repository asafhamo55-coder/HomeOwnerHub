'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge, Card, cn } from '@homeowner-portal/ui'
import type { TenantHealthRow } from '@/lib/platform-admin'

type SortField = 'name' | 'members' | 'units' | 'vendors_at_risk' | 'open_violations' | 'ai_runs_30d' | 'outstanding_dues_usd'
type SortDir = 'asc' | 'desc'

interface TenantHealthTableProps {
  rows: TenantHealthRow[]
}

export function TenantHealthTable({ rows }: TenantHealthTableProps) {
  const [sortField, setSortField] = useState<SortField>('outstanding_dues_usd')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const aVal = a[sortField]
    const bVal = b[sortField]
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    }
    const diff = (aVal as number) - (bVal as number)
    return sortDir === 'asc' ? diff : -diff
  })

  function SortHeader({ field, label, align }: { field: SortField; label: string; align?: 'right' }) {
    const active = sortField === field
    return (
      <th
        className={cn(
          'px-3 py-2 cursor-pointer select-none hover:text-foreground transition-colors',
          align === 'right' && 'text-right',
        )}
        tabIndex={0}
        role="columnheader"
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        onClick={() => toggleSort(field)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSort(field) } }}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active && <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
        </span>
      </th>
    )
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <SortHeader field="name" label="Tenant" />
              <th className="px-3 py-2">Plan</th>
              <SortHeader field="members" label="Members" align="right" />
              <SortHeader field="units" label="Units" align="right" />
              <SortHeader field="vendors_at_risk" label="Vendors at risk" align="right" />
              <SortHeader field="open_violations" label="Open violations" align="right" />
              <SortHeader field="ai_runs_30d" label="AI runs (30d)" align="right" />
              <SortHeader field="outstanding_dues_usd" label="Outstanding dues" align="right" />
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr
                key={t.id}
                className="border-b border-border last:border-0 hover:bg-foreground/5"
              >
                <td className="px-3 py-2">
                  <Link href={`/admin/tenants/${t.id}`} className="font-medium hover:text-primary">
                    {t.name}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" size="sm" className="capitalize">{t.plan}</Badge>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{t.members}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t.units}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className={cn(t.vendors_at_risk > 0 && 'text-destructive font-medium')}>
                    {t.vendors_at_risk}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className={cn(t.open_violations > 0 && 'text-amber-600 font-medium')}>
                    {t.open_violations}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{t.ai_runs_30d}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {t.outstanding_dues_usd > 0 ? (
                    <span className="font-medium">${t.outstanding_dues_usd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                  ) : (
                    <span className="text-muted">$0</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {t.suspended_at ? (
                    <Badge variant="destructive" size="sm">Suspended</Badge>
                  ) : (
                    <Badge variant="success" size="sm">Active</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
