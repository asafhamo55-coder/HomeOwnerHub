import { StatusPill } from '@homeowner-portal/ui'
import { formatShortDate } from '@/lib/format-datetime'

/**
 * One status vocabulary for tenants across the platform-admin tree
 * (list, detail, preview, analytics), so "Suspended" reads the same
 * everywhere. Archived wins over suspended.
 */
export type TenantStatus = 'active' | 'suspended' | 'archived'

export function tenantStatus(t: { suspended_at: string | null; archived_at?: string | null }): TenantStatus {
  if (t.archived_at) return 'archived'
  if (t.suspended_at) return 'suspended'
  return 'active'
}

export function TenantStatusPill({
  tenant,
  withDate = false,
}: {
  tenant: { suspended_at: string | null; archived_at?: string | null }
  /** Append the date the state began ("Suspended Oct 2, 2026"). */
  withDate?: boolean
}) {
  const status = tenantStatus(tenant)
  if (status === 'active') return <StatusPill tone="success" label="Active" />
  const since = status === 'archived' ? tenant.archived_at : tenant.suspended_at
  const label = status === 'archived' ? 'Archived' : 'Suspended'
  return (
    <StatusPill
      tone={status === 'archived' ? 'neutral' : 'danger'}
      label={withDate && since ? `${label} ${formatShortDate(since)}` : label}
    />
  )
}

/** "free" → "Free"; plans are lower-case slugs in the DB. */
export function planLabel(plan: string): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1).replace(/_/g, ' ')
}
