'use server'

// Platform Admin data layer. Cross-tenant operations for HomeownerHub
// staff. Everything in this file goes through the service-role client
// (bypasses RLS) and is gated by requirePlatformAdmin() — so the
// per-org RLS policies stay narrow + auditable.
//
// Every write emits a row in `platform_admin_audit`.

import { randomBytes } from 'node:crypto'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { sendEmail, appUrl } from '@/lib/email'
import { isUsStateCode } from '@/lib/us-states'

// ─── Types ──────────────────────────────────────────────────────────

export interface TenantRow {
  id: string
  name: string
  hub_type: string
  plan: string
  doors_count: number | null
  organization_type: string | null
  created_at: string | null
  member_count: number
  association_count: number
  units_count: number
  last_activity_at: string | null
  suspended_at: string | null
  archived_at: string | null
}

export interface TenantStatistics {
  org: {
    id: string
    name: string
    hub_type: string
    plan: string
    doors_count: number | null
    organization_type: string | null
    created_at: string | null
    suspended_at: string | null
    archived_at: string | null
  }
  members: { admin: number; board: number; resident: number; total: number }
  units: number
  associations: number
  vendors: { total: number; green: number; yellow: number; red: number; missing: number }
  rfps: { total: number; draft: number; open: number; awarded: number; cancelled: number }
  bids: { total: number; submitted: number; awarded: number; declined: number }
  violations: { open: number; cured: number; fined: number; escalated: number }
  dues: { outstanding_usd: number; properties_behind: number }
  ai_runs_30d: number
  arc_pending: number
  documents: number
  recent_activity: Array<{
    kind: string
    title: string
    occurred_at: string
  }>
}

export interface PlatformStats {
  total_tenants: number
  active_tenants: number
  suspended_tenants: number
  total_members: number
  total_units: number
  total_vendors: number
  ai_runs_30d: number
  tenants_by_plan: Array<{ plan: string; count: number }>
  tenants_over_time: Array<{ month: string; count: number }>
  workflows_30d: Array<{ workflow_id: string; runs: number }>
}

export interface AuditRow {
  id: string
  actor_user_id: string
  actor_email: string | null
  action: string
  target_org_id: string | null
  target_org_name: string | null
  payload: Record<string, unknown> | null
  created_at: string
}

type ActionOk<T> = T extends void ? { ok: true } : { ok: true; data: T }
type ActionErr = { ok: false; error: string }
export type ActionResult<T = void> = ActionOk<T> | ActionErr

// ─── Auth ───────────────────────────────────────────────────────────

export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

  // Use the SQL helper instead of querying the table directly. The
  // user-bound client has no SELECT on platform_admins; the helper is
  // SECURITY DEFINER so it can answer.
  const { data } = await supabase.rpc('auth_is_platform_admin' as never)
  return data === true
}

export async function requirePlatformAdmin(): Promise<{ userId: string }> {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/admin')

  const ok = await isPlatformAdmin()
  if (!ok) redirect('/')
  return { userId: user.id }
}

// ─── Audit helper ───────────────────────────────────────────────────

async function writeAudit(
  db: ReturnType<typeof createAdminClient>,
  actorUserId: string,
  action: string,
  targetOrgId: string | null,
  payload: Record<string, unknown> | null,
): Promise<void> {
  await db
    .from('platform_admin_audit' as never)
    .insert({
      actor_user_id: actorUserId,
      action,
      target_org_id: targetOrgId,
      payload,
    } as never)
}

// ─── Reads ──────────────────────────────────────────────────────────

export async function listTenants(): Promise<TenantRow[]> {
  await requirePlatformAdmin()
  const db = createAdminClient()

  const { data: orgs } = await db
    .from('orgs' as never)
    .select('*')
    .order('created_at', { ascending: false })

  if (!orgs || orgs.length === 0) return []

  const orgIds = (orgs as Array<{ id: string }>).map((o) => o.id)

  // Counts via Promise.all so the listing stays a single round-trip
  // per relation, not per tenant.
  const [memberCounts, associationCounts, unitCounts] = await Promise.all([
    countByOrg(db, 'org_members', 'org_id', orgIds),
    countByOrg(db, 'associations', 'organization_id', orgIds),
    countByOrg(db, 'units', 'organization_id', orgIds),
  ])

  return (orgs as Array<{
    id: string
    name: string
    hub_type: string
    plan: string
    doors_count: number | null
    organization_type: string | null
    created_at: string | null
    suspended_at: string | null
    archived_at?: string | null
  }>).map((o) => ({
    ...o,
    archived_at: o.archived_at ?? null,
    member_count: memberCounts.get(o.id) ?? 0,
    association_count: associationCounts.get(o.id) ?? 0,
    units_count: unitCounts.get(o.id) ?? 0,
    last_activity_at: o.created_at, // placeholder until activity is tracked
  }))
}

async function countByOrg(
  db: ReturnType<typeof createAdminClient>,
  table: string,
  orgColumn: string,
  orgIds: string[],
): Promise<Map<string, number>> {
  const { data } = await db
    .from(table as never)
    .select(orgColumn as never)
    .in(orgColumn as never, orgIds as never)
  const counts = new Map<string, number>()
  for (const row of (data ?? []) as Array<Record<string, string>>) {
    const id = row[orgColumn]
    if (!id) continue
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

export async function getTenantDetail(orgId: string): Promise<TenantStatistics | null> {
  await requirePlatformAdmin()
  const db = createAdminClient()

  const { data: org } = await db
    .from('orgs' as never)
    .select('*')
    .eq('id', orgId)
    .maybeSingle<{
      id: string
      name: string
      hub_type: string
      plan: string
      doors_count: number | null
      organization_type: string | null
      created_at: string | null
      suspended_at: string | null
      archived_at?: string | null
    }>()

  if (!org) return null

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString()

  const [
    { data: memberRows },
    { count: units },
    { count: associations },
    { data: vendorComplianceRows },
    { data: rfpRows },
    { data: bidRows },
    { data: violationRows },
    { data: duesRows },
    { count: aiRuns },
    { count: arcPending },
    { count: documents },
  ] = await Promise.all([
    db.from('org_members').select('role').eq('org_id', orgId),
    db.from('units' as never).select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    db.from('associations' as never).select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    db.from('vendor_compliance' as never).select('coi_status').eq('organization_id', orgId),
    db.from('rfps' as never).select('status').eq('organization_id', orgId),
    db.from('bids' as never).select('status').eq('organization_id', orgId),
    db.from('hoa_violations').select('status').eq('org_id', orgId),
    db
      .from('hoa_dues')
      .select('amount_due, amount_paid, status')
      .eq('org_id', orgId),
    db
      .from('ai_runs' as never)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('created_at', thirtyDaysAgoIso),
    db
      .from('arc_requests' as never)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .in('status', ['submitted', 'in_review']),
    db.from('hoa_documents').select('id', { count: 'exact', head: true }),
  ])

  const memberCounts = { admin: 0, board: 0, resident: 0, total: 0 }
  for (const r of (memberRows ?? []) as Array<{ role: string }>) {
    memberCounts.total += 1
    if (r.role === 'admin') memberCounts.admin += 1
    else if (r.role === 'board') memberCounts.board += 1
    else if (r.role === 'resident') memberCounts.resident += 1
  }

  const vendorCounts = { total: 0, green: 0, yellow: 0, red: 0, missing: 0 }
  for (const r of (vendorComplianceRows ?? []) as unknown as Array<{ coi_status: string | null }>) {
    vendorCounts.total += 1
    const s = r.coi_status ?? 'missing'
    if (s === 'green') vendorCounts.green += 1
    else if (s === 'yellow') vendorCounts.yellow += 1
    else if (s === 'red') vendorCounts.red += 1
    else vendorCounts.missing += 1
  }

  const rfpCounts = { total: 0, draft: 0, open: 0, awarded: 0, cancelled: 0 }
  for (const r of (rfpRows ?? []) as unknown as Array<{ status: string }>) {
    rfpCounts.total += 1
    if (r.status === 'draft') rfpCounts.draft += 1
    else if (r.status === 'open' || r.status === 'evaluation') rfpCounts.open += 1
    else if (r.status === 'awarded') rfpCounts.awarded += 1
    else if (r.status === 'cancelled') rfpCounts.cancelled += 1
  }

  const bidCounts = { total: 0, submitted: 0, awarded: 0, declined: 0 }
  for (const r of (bidRows ?? []) as unknown as Array<{ status: string }>) {
    bidCounts.total += 1
    if (r.status === 'submitted') bidCounts.submitted += 1
    else if (r.status === 'awarded') bidCounts.awarded += 1
    else if (r.status === 'declined') bidCounts.declined += 1
  }

  const violationCounts = { open: 0, cured: 0, fined: 0, escalated: 0 }
  for (const r of (violationRows ?? []) as Array<{ status: string }>) {
    if (r.status === 'open' || r.status === 'notice_sent') violationCounts.open += 1
    else if (r.status === 'cured' || r.status === 'resolved') violationCounts.cured += 1
    else if (r.status === 'fined') violationCounts.fined += 1
    else if (r.status === 'escalated') violationCounts.escalated += 1
  }

  let duesOutstanding = 0
  const duesPropertiesBehind = new Set<string>()
  for (const r of (duesRows ?? []) as Array<{
    amount_due: number | null
    amount_paid: number | null
    status: string | null
  }>) {
    if (r.status === 'paid' || r.status === 'waived') continue
    const remainder = Number(r.amount_due ?? 0) - Number(r.amount_paid ?? 0)
    if (remainder > 0) duesOutstanding += remainder
  }

  return {
    org: { ...org, archived_at: org.archived_at ?? null },
    members: memberCounts,
    units: units ?? 0,
    associations: associations ?? 0,
    vendors: vendorCounts,
    rfps: rfpCounts,
    bids: bidCounts,
    violations: violationCounts,
    dues: { outstanding_usd: duesOutstanding, properties_behind: duesPropertiesBehind.size },
    ai_runs_30d: aiRuns ?? 0,
    arc_pending: arcPending ?? 0,
    documents: documents ?? 0,
    recent_activity: [],
  }
}

export async function getPlatformStats(): Promise<PlatformStats> {
  await requirePlatformAdmin()
  const db = createAdminClient()

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString()

  const [
    { data: orgs },
    { count: totalMembers },
    { count: totalUnits },
    { count: totalVendors },
    { count: aiRuns },
    { data: aiRunsRows },
  ] = await Promise.all([
    db.from('orgs' as never).select('id, plan, created_at, suspended_at'),
    db.from('org_members').select('user_id', { count: 'exact', head: true }),
    db.from('units' as never).select('id', { count: 'exact', head: true }),
    db.from('vendors' as never).select('id', { count: 'exact', head: true }),
    db
      .from('ai_runs' as never)
      .select('id', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgoIso),
    db
      .from('ai_runs' as never)
      .select('workflow_id')
      .gte('created_at', thirtyDaysAgoIso),
  ])

  const orgsTyped = (orgs ?? []) as Array<{
    id: string
    plan: string
    created_at: string | null
    suspended_at: string | null
  }>

  const planCounts = new Map<string, number>()
  let activeTenants = 0
  let suspendedTenants = 0
  for (const o of orgsTyped) {
    planCounts.set(o.plan, (planCounts.get(o.plan) ?? 0) + 1)
    if (o.suspended_at) suspendedTenants += 1
    else activeTenants += 1
  }

  // Tenants created per month, last 12 months.
  const months: Array<{ month: string; count: number }> = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    months.push({ month: key, count: 0 })
  }
  for (const o of orgsTyped) {
    if (!o.created_at) continue
    const created = new Date(o.created_at)
    const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`
    const bucket = months.find((m) => m.month === key)
    if (bucket) bucket.count += 1
  }

  // Workflow usage in the last 30 days.
  const workflowCounts = new Map<string, number>()
  for (const r of (aiRunsRows ?? []) as unknown as Array<{ workflow_id: string }>) {
    workflowCounts.set(r.workflow_id, (workflowCounts.get(r.workflow_id) ?? 0) + 1)
  }
  const workflows30d = Array.from(workflowCounts.entries())
    .map(([workflow_id, runs]) => ({ workflow_id, runs }))
    .sort((a, b) => b.runs - a.runs)

  return {
    total_tenants: orgsTyped.length,
    active_tenants: activeTenants,
    suspended_tenants: suspendedTenants,
    total_members: totalMembers ?? 0,
    total_units: totalUnits ?? 0,
    total_vendors: totalVendors ?? 0,
    ai_runs_30d: aiRuns ?? 0,
    tenants_by_plan: Array.from(planCounts.entries()).map(([plan, count]) => ({ plan, count })),
    tenants_over_time: months,
    workflows_30d: workflows30d,
  }
}

// ─── Platform analytics ─────────────────────────────────────────────

export interface TenantHealthRow {
  id: string
  name: string
  plan: string
  created_at: string | null
  suspended_at: string | null
  members: number
  units: number
  associations: number
  vendors: number
  vendors_at_risk: number
  open_violations: number
  ai_runs_30d: number
  outstanding_dues_usd: number
}

export interface PlatformAnalytics {
  total_tenants: number
  active_tenants: number
  suspended_tenants: number
  total_members: number
  total_units: number
  total_vendors: number
  total_violations: number
  total_open_violations: number
  total_ai_runs_30d: number
  total_outstanding_dues_usd: number
  tenants_by_plan: Array<{ plan: string; count: number }>
  tenants_over_time: Array<{ month: string; count: number }>
  members_over_time: Array<{ month: string; count: number }>
  violations_by_status: Array<{ status: string; count: number }>
  vendor_compliance: { green: number; yellow: number; red: number; missing: number }
  feature_adoption: Array<{ feature: string; tenants_using: number; total_tenants: number }>
  workflows_30d: Array<{ workflow_id: string; runs: number }>
  tenant_health: TenantHealthRow[]
}

export async function getAnalyticsData(): Promise<PlatformAnalytics> {
  await requirePlatformAdmin()
  const db = createAdminClient()

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString()

  const [
    { data: orgs },
    { data: memberRows },
    { data: unitRows },
    { data: vendorRows },
    { data: violationRows },
    { data: aiRunRows },
    { data: duesRows },
    { data: associationRows },
    { data: rfpOrgs },
    { data: arcOrgs },
    { data: docOrgs },
  ] = await Promise.all([
    db.from('orgs' as never).select('id, name, plan, created_at, suspended_at'),
    db.from('org_members').select('org_id, invited_at'),
    db.from('units' as never).select('organization_id'),
    db.from('vendor_compliance' as never).select('organization_id, coi_status'),
    db.from('hoa_violations').select('org_id, status'),
    db.from('ai_runs' as never).select('organization_id, workflow_id, created_at').gte('created_at', thirtyDaysAgoIso),
    db.from('assessments' as never).select('organization_id, amount, status, payments(amount)').neq('status', 'paid').neq('status', 'waived').neq('status', 'written_off'),
    db.from('associations' as never).select('organization_id'),
    db.from('rfps' as never).select('organization_id'),
    db.from('arc_requests' as never).select('organization_id'),
    db.from('hoa_documents').select('org_id'),
  ])

  const orgsTyped = (orgs ?? []) as Array<{
    id: string; name: string; plan: string; created_at: string | null; suspended_at: string | null
  }>

  const planCounts = new Map<string, number>()
  let activeTenants = 0
  let suspendedTenants = 0
  for (const o of orgsTyped) {
    planCounts.set(o.plan, (planCounts.get(o.plan) ?? 0) + 1)
    if (o.suspended_at) suspendedTenants += 1
    else activeTenants += 1
  }

  // Tenants created per month, last 12 months
  const months: Array<{ month: string; count: number }> = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    months.push({ month: key, count: 0 })
  }
  for (const o of orgsTyped) {
    if (!o.created_at) continue
    const created = new Date(o.created_at)
    const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`
    const bucket = months.find((m) => m.month === key)
    if (bucket) bucket.count += 1
  }

  // Members joined per month
  const memberMonths: Array<{ month: string; count: number }> = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    memberMonths.push({ month: key, count: 0 })
  }
  for (const r of (memberRows ?? []) as Array<{ org_id: string; invited_at: string | null }>) {
    if (!r.invited_at) continue
    const d = new Date(r.invited_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const bucket = memberMonths.find((m) => m.month === key)
    if (bucket) bucket.count += 1
  }

  // Per-org counts for tenant health table
  const orgMemberCounts = new Map<string, number>()
  for (const r of (memberRows ?? []) as Array<{ org_id: string }>) {
    orgMemberCounts.set(r.org_id, (orgMemberCounts.get(r.org_id) ?? 0) + 1)
  }

  const orgUnitCounts = new Map<string, number>()
  for (const r of (unitRows ?? []) as unknown as Array<{ organization_id: string }>) {
    orgUnitCounts.set(r.organization_id, (orgUnitCounts.get(r.organization_id) ?? 0) + 1)
  }

  const orgAssocCounts = new Map<string, number>()
  for (const r of (associationRows ?? []) as unknown as Array<{ organization_id: string }>) {
    orgAssocCounts.set(r.organization_id, (orgAssocCounts.get(r.organization_id) ?? 0) + 1)
  }

  const orgVendorCounts = new Map<string, number>()
  const orgVendorAtRisk = new Map<string, number>()
  const complianceTotals = { green: 0, yellow: 0, red: 0, missing: 0 }
  for (const r of (vendorRows ?? []) as unknown as Array<{ organization_id: string; coi_status: string | null }>) {
    orgVendorCounts.set(r.organization_id, (orgVendorCounts.get(r.organization_id) ?? 0) + 1)
    const s = r.coi_status ?? 'missing'
    if (s === 'green') complianceTotals.green += 1
    else if (s === 'yellow') { complianceTotals.yellow += 1; orgVendorAtRisk.set(r.organization_id, (orgVendorAtRisk.get(r.organization_id) ?? 0) + 1) }
    else if (s === 'red') { complianceTotals.red += 1; orgVendorAtRisk.set(r.organization_id, (orgVendorAtRisk.get(r.organization_id) ?? 0) + 1) }
    else complianceTotals.missing += 1
  }

  // Violations by status
  const violationStatusCounts = new Map<string, number>()
  const orgOpenViolations = new Map<string, number>()
  let totalOpenViolations = 0
  for (const r of (violationRows ?? []) as Array<{ org_id: string; status: string }>) {
    violationStatusCounts.set(r.status, (violationStatusCounts.get(r.status) ?? 0) + 1)
    if (r.status === 'open' || r.status === 'notice_sent') {
      totalOpenViolations += 1
      orgOpenViolations.set(r.org_id, (orgOpenViolations.get(r.org_id) ?? 0) + 1)
    }
  }

  // AI runs per org (30d)
  const orgAiRuns = new Map<string, number>()
  const workflowCounts = new Map<string, number>()
  for (const r of (aiRunRows ?? []) as unknown as Array<{ organization_id: string; workflow_id: string }>) {
    orgAiRuns.set(r.organization_id, (orgAiRuns.get(r.organization_id) ?? 0) + 1)
    workflowCounts.set(r.workflow_id, (workflowCounts.get(r.workflow_id) ?? 0) + 1)
  }

  // Outstanding dues per org
  const orgDues = new Map<string, number>()
  let totalDues = 0
  for (const r of (duesRows ?? []) as unknown as Array<{
    organization_id: string; amount: number | string | null; status: string | null; payments: Array<{ amount: number | string }>
  }>) {
    const paid = (r.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
    const remainder = Math.max(Number(r.amount ?? 0) - paid, 0)
    if (remainder > 0) {
      totalDues += remainder
      orgDues.set(r.organization_id, (orgDues.get(r.organization_id) ?? 0) + remainder)
    }
  }

  // Feature adoption: count how many tenants have at least one row in each feature table
  const rfpOrgSet = new Set((rfpOrgs ?? []).map((r: any) => r.organization_id).filter(Boolean))
  const arcOrgSet = new Set((arcOrgs ?? []).map((r: any) => r.organization_id).filter(Boolean))
  const docOrgSet = new Set((docOrgs ?? []).map((r: any) => r.org_id).filter(Boolean))
  const violOrgSet = new Set((violationRows ?? []).map((r: any) => r.org_id).filter(Boolean))
  const vendorOrgSet = new Set((vendorRows ?? []).map((r: any) => r.organization_id).filter(Boolean))
  const aiOrgSet = new Set((aiRunRows ?? []).map((r: any) => r.organization_id).filter(Boolean))

  const totalT = orgsTyped.length
  const featureAdoption = [
    { feature: 'Violations', tenants_using: violOrgSet.size, total_tenants: totalT },
    { feature: 'Vendor management', tenants_using: vendorOrgSet.size, total_tenants: totalT },
    { feature: 'Documents', tenants_using: docOrgSet.size, total_tenants: totalT },
    { feature: 'ARC requests', tenants_using: arcOrgSet.size, total_tenants: totalT },
    { feature: 'Procurement (RFPs)', tenants_using: rfpOrgSet.size, total_tenants: totalT },
    { feature: 'AI workflows', tenants_using: aiOrgSet.size, total_tenants: totalT },
  ].sort((a, b) => b.tenants_using - a.tenants_using)

  // Build tenant health table
  const tenantHealth: TenantHealthRow[] = orgsTyped.map((o) => ({
    id: o.id,
    name: o.name,
    plan: o.plan,
    created_at: o.created_at,
    suspended_at: o.suspended_at,
    members: orgMemberCounts.get(o.id) ?? 0,
    units: orgUnitCounts.get(o.id) ?? 0,
    associations: orgAssocCounts.get(o.id) ?? 0,
    vendors: orgVendorCounts.get(o.id) ?? 0,
    vendors_at_risk: orgVendorAtRisk.get(o.id) ?? 0,
    open_violations: orgOpenViolations.get(o.id) ?? 0,
    ai_runs_30d: orgAiRuns.get(o.id) ?? 0,
    outstanding_dues_usd: orgDues.get(o.id) ?? 0,
  }))

  return {
    total_tenants: totalT,
    active_tenants: activeTenants,
    suspended_tenants: suspendedTenants,
    total_members: (memberRows ?? []).length,
    total_units: (unitRows ?? []).length,
    total_vendors: orgVendorCounts.size > 0 ? Array.from(orgVendorCounts.values()).reduce((a, b) => a + b, 0) : 0,
    total_violations: (violationRows ?? []).length,
    total_open_violations: totalOpenViolations,
    total_ai_runs_30d: (aiRunRows ?? []).length,
    total_outstanding_dues_usd: totalDues,
    tenants_by_plan: Array.from(planCounts.entries()).map(([plan, count]) => ({ plan, count })),
    tenants_over_time: months,
    members_over_time: memberMonths,
    violations_by_status: Array.from(violationStatusCounts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    vendor_compliance: complianceTotals,
    feature_adoption: featureAdoption,
    workflows_30d: Array.from(workflowCounts.entries())
      .map(([workflow_id, runs]) => ({ workflow_id, runs }))
      .sort((a, b) => b.runs - a.runs),
    tenant_health: tenantHealth,
  }
}

// ─── Tenant preview (read-only "view as tenant") ────────────────────
// Returns chart-shaped data for a single tenant via service-role.
// Mirrors the shape of lib/dashboard/charts.ts so the preview page can
// reuse the existing client components (StatusDonut, ActivityBar).
// Emits one audit row per call so we have a log of every preview view.

export interface TenantPreviewData {
  org: { id: string; name: string; plan: string; suspended_at: string | null }
  violations_donut: {
    segments: Array<{ label: string; value: number; tone: 'success' | 'warning' | 'destructive' | 'muted' | 'primary' }>
    total: number
  }
  vendor_compliance_donut: {
    segments: Array<{ label: string; value: number; tone: 'success' | 'warning' | 'destructive' | 'muted' | 'primary' }>
    total: number
  }
  activity_30d: Array<{ date: string; violations: number; arc: number; invitations: number }>
}

export async function getTenantPreview(
  orgId: string,
): Promise<TenantPreviewData | null> {
  const { userId } = await requirePlatformAdmin()
  const db = createAdminClient()

  const { data: org } = await db
    .from('orgs' as never)
    .select('id, name, plan, suspended_at')
    .eq('id', orgId)
    .maybeSingle<{
      id: string
      name: string
      plan: string
      suspended_at: string | null
    }>()
  if (!org) return null

  // Audit the view. Best-effort; failure shouldn't block the preview.
  await writeAudit(db, userId, 'tenant.preview', orgId, null).catch(() => {})

  const start = new Date()
  start.setUTCDate(start.getUTCDate() - 29)
  start.setUTCHours(0, 0, 0, 0)
  const startIso = start.toISOString()

  const [
    { data: violations },
    { data: vendorCompliance },
    { data: viols30 },
    { data: arc30 },
    { data: invites30 },
  ] = await Promise.all([
    db.from('hoa_violations').select('status').eq('org_id', orgId),
    db.from('vendor_compliance' as never).select('coi_status').eq('organization_id', orgId),
    db.from('hoa_violations').select('created_at').eq('org_id', orgId).gte('created_at', startIso),
    db.from('arc_requests' as never).select('submitted_at').eq('organization_id', orgId).gte('submitted_at', startIso),
    db
      .from('vendor_onboarding_invitations' as never)
      .select('created_at')
      .eq('organization_id', orgId)
      .gte('created_at', startIso),
  ])

  // Violations donut.
  const vCounts: Record<string, number> = {}
  for (const r of (violations ?? []) as Array<{ status: string | null }>) {
    const s = r.status ?? 'unknown'
    vCounts[s] = (vCounts[s] ?? 0) + 1
  }
  const violationSegments: TenantPreviewData['violations_donut']['segments'] = []
  if (vCounts.open) violationSegments.push({ label: 'Open', value: vCounts.open, tone: 'primary' })
  if (vCounts.notice_sent) violationSegments.push({ label: 'Notice sent', value: vCounts.notice_sent, tone: 'warning' })
  if (vCounts.cured) violationSegments.push({ label: 'Cured', value: vCounts.cured, tone: 'success' })
  if (vCounts.resolved) violationSegments.push({ label: 'Resolved', value: vCounts.resolved, tone: 'muted' })
  if (vCounts.fined) violationSegments.push({ label: 'Fined', value: vCounts.fined, tone: 'destructive' })
  if (vCounts.escalated) violationSegments.push({ label: 'Escalated', value: vCounts.escalated, tone: 'destructive' })
  const vTotal = violationSegments.reduce((acc, s) => acc + s.value, 0)

  // Vendor compliance donut.
  const cCounts = { green: 0, yellow: 0, red: 0, missing: 0 }
  for (const r of (vendorCompliance ?? []) as unknown as Array<{ coi_status: string | null }>) {
    const k = (r.coi_status ?? 'missing') as keyof typeof cCounts
    if (k in cCounts) cCounts[k] += 1
    else cCounts.missing += 1
  }
  const vendorSegments: TenantPreviewData['vendor_compliance_donut']['segments'] = []
  if (cCounts.green) vendorSegments.push({ label: 'Compliant', value: cCounts.green, tone: 'success' })
  if (cCounts.yellow) vendorSegments.push({ label: 'Action soon', value: cCounts.yellow, tone: 'warning' })
  if (cCounts.red) vendorSegments.push({ label: 'Non-compliant', value: cCounts.red, tone: 'destructive' })
  if (cCounts.missing) vendorSegments.push({ label: 'Docs missing', value: cCounts.missing, tone: 'muted' })
  const cTotal = vendorSegments.reduce((acc, s) => acc + s.value, 0)

  // 30-day activity buckets.
  const buckets = new Map<string, { date: string; violations: number; arc: number; invitations: number }>()
  for (let i = 0; i < 30; i++) {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    const k = d.toISOString().slice(0, 10)
    buckets.set(k, { date: k, violations: 0, arc: 0, invitations: 0 })
  }
  for (const r of (viols30 ?? []) as Array<{ created_at: string }>) {
    const k = r.created_at.slice(0, 10)
    const b = buckets.get(k)
    if (b) b.violations += 1
  }
  for (const r of (arc30 ?? []) as unknown as Array<{ submitted_at: string }>) {
    const k = r.submitted_at.slice(0, 10)
    const b = buckets.get(k)
    if (b) b.arc += 1
  }
  for (const r of (invites30 ?? []) as unknown as Array<{ created_at: string }>) {
    const k = r.created_at.slice(0, 10)
    const b = buckets.get(k)
    if (b) b.invitations += 1
  }

  return {
    org,
    violations_donut: { segments: violationSegments, total: vTotal },
    vendor_compliance_donut: { segments: vendorSegments, total: cTotal },
    activity_30d: Array.from(buckets.values()),
  }
}

export async function listPlatformAuditLog(limit = 100): Promise<AuditRow[]> {
  await requirePlatformAdmin()
  const db = createAdminClient()

  const { data } = await db
    .from('platform_admin_audit' as never)
    .select(
      'id, actor_user_id, action, target_org_id, payload, created_at, actor:profiles!platform_admin_audit_actor_user_id_fkey(email), org:orgs(name)',
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  return ((data ?? []) as unknown as Array<{
    id: string
    actor_user_id: string
    action: string
    target_org_id: string | null
    payload: Record<string, unknown> | null
    created_at: string
    actor: { email: string | null } | null
    org: { name: string } | null
  }>).map((r) => ({
    id: r.id,
    actor_user_id: r.actor_user_id,
    actor_email: r.actor?.email ?? null,
    action: r.action,
    target_org_id: r.target_org_id,
    target_org_name: r.org?.name ?? null,
    payload: r.payload,
    created_at: r.created_at,
  }))
}

// ─── Writes ─────────────────────────────────────────────────────────

const CreateTenantSchema = z.object({
  name: z.string().trim().min(2, 'HOA name is required.').max(200),
  hub_type: z.enum(['hoa']).default('hoa'),
  plan: z.enum(['free', 'pro', 'enterprise']).default('free'),
  doors_count: z.number().int().min(0).nullable().optional(),
  association_name: z.string().trim().min(2).max(200),
  // Any valid USPS 2-letter US state/DC code. Was previously locked
  // to GA/FL/CA/TX (the W30 State Law Brain v1 footprint), but tenant
  // creation shouldn't be limited by what state-law content we've
  // curated — every state can run an HOA. State-law features still
  // surface "we don't yet support this state" gracefully on unmapped
  // codes.
  state: z.string().refine(isUsStateCode, 'Pick a US state.'),
  association_type: z.enum(['hoa', 'condo', 'coop']).default('hoa'),
  invite_admin_email: z
    .string()
    .trim()
    .email('Admin email looks invalid.')
    .optional()
    .or(z.literal('')),
})

export interface CreateTenantInput {
  name: string
  plan?: 'free' | 'pro' | 'enterprise'
  doorsCount?: number | null
  associationName: string
  /** USPS 2-letter state code (any US state + DC). */
  state: string
  associationType?: 'hoa' | 'condo' | 'coop'
  inviteAdminEmail?: string | null
}

export async function createTenant(
  input: CreateTenantInput,
): Promise<ActionResult<{ orgId: string }>> {
  const { userId } = await requirePlatformAdmin()

  const parsed = CreateTenantSchema.safeParse({
    name: input.name,
    hub_type: 'hoa',
    plan: input.plan ?? 'free',
    doors_count: input.doorsCount ?? null,
    association_name: input.associationName,
    state: input.state,
    association_type: input.associationType ?? 'hoa',
    invite_admin_email: input.inviteAdminEmail ?? '',
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const db = createAdminClient()

  const { data: orgRow, error: orgErr } = await db
    .from('orgs')
    .insert({
      name: parsed.data.name,
      hub_type: parsed.data.hub_type,
      plan: parsed.data.plan,
      doors_count: parsed.data.doors_count,
      organization_type: 'self_managed_hoa',
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (orgErr || !orgRow) {
    return { ok: false, error: orgErr?.message ?? 'Could not create tenant.' }
  }

  await db
    .from('associations' as never)
    .insert({
      organization_id: orgRow.id,
      name: parsed.data.association_name,
      state: parsed.data.state,
      type: parsed.data.association_type,
    } as never)

  // Optional: invite the initial admin. We create the Supabase Auth
  // user if needed and add them as `admin` of the new org.
  let inviteResult: 'sent' | 'skipped' | 'failed' = 'skipped'
  let inviteError: string | undefined
  if (parsed.data.invite_admin_email && parsed.data.invite_admin_email !== '') {
    const { data: invitedUser, error: inviteErr } = await db.auth.admin
      .inviteUserByEmail(parsed.data.invite_admin_email)
    if (inviteErr) {
      // Fall back to lookup if the user already exists.
      const { data: list } = await db.auth.admin.listUsers()
      const existing = list?.users.find(
        (u) => u.email?.toLowerCase() === parsed.data.invite_admin_email!.toLowerCase(),
      )
      if (existing) {
        await db
          .from('org_members')
          .insert({
            org_id: orgRow.id,
            user_id: existing.id,
            role: 'admin',
            invited_at: new Date().toISOString(),
          } as never)
        inviteResult = 'sent'
      } else {
        inviteResult = 'failed'
        inviteError = inviteErr.message
      }
    } else if (invitedUser?.user) {
      await db
        .from('profiles')
        .upsert({
          id: invitedUser.user.id,
          email: parsed.data.invite_admin_email,
        } as never)
      await db
        .from('org_members')
        .insert({
          org_id: orgRow.id,
          user_id: invitedUser.user.id,
          role: 'admin',
          invited_at: new Date().toISOString(),
        } as never)
      inviteResult = 'sent'
    }
  }

  await writeAudit(db, userId, 'tenant.create', orgRow.id, {
    name: parsed.data.name,
    plan: parsed.data.plan,
    state: parsed.data.state,
    invite_admin_email: parsed.data.invite_admin_email || null,
    invite_result: inviteResult,
    invite_error: inviteError,
  })

  revalidatePath('/admin')
  revalidatePath('/admin/tenants')
  return { ok: true, data: { orgId: orgRow.id } }
}

const UpdateTenantSchema = z.object({
  org_id: z.string().uuid(),
  name: z.string().trim().min(2).max(200).optional(),
  plan: z.enum(['free', 'pro', 'enterprise']).optional(),
  doors_count: z.number().int().min(0).nullable().optional(),
})

export interface UpdateTenantInput {
  orgId: string
  name?: string
  plan?: 'free' | 'pro' | 'enterprise'
  doorsCount?: number | null
}

export async function updateTenant(input: UpdateTenantInput): Promise<ActionResult> {
  const { userId } = await requirePlatformAdmin()
  const parsed = UpdateTenantSchema.safeParse({
    org_id: input.orgId,
    name: input.name,
    plan: input.plan,
    doors_count: input.doorsCount,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const db = createAdminClient()
  const patch: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) patch.name = parsed.data.name
  if (parsed.data.plan !== undefined) patch.plan = parsed.data.plan
  if (parsed.data.doors_count !== undefined) patch.doors_count = parsed.data.doors_count
  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await db
    .from('orgs')
    .update(patch as never)
    .eq('id', parsed.data.org_id)
  if (error) return { ok: false, error: error.message }

  await writeAudit(db, userId, 'tenant.update', parsed.data.org_id, patch)
  revalidatePath('/admin/tenants')
  revalidatePath(`/admin/tenants/${parsed.data.org_id}`)
  return { ok: true }
}

export async function suspendTenant(
  orgId: string,
  reason?: string | null,
): Promise<ActionResult> {
  const { userId } = await requirePlatformAdmin()
  const db = createAdminClient()
  const { error } = await db
    .from('orgs')
    .update({ suspended_at: new Date().toISOString() } as never)
    .eq('id', orgId)
  if (error) return { ok: false, error: error.message }

  await writeAudit(db, userId, 'tenant.suspend', orgId, { reason: reason ?? null })
  revalidatePath(`/admin/tenants/${orgId}`)
  revalidatePath('/admin/tenants')
  return { ok: true }
}

export async function resumeTenant(orgId: string): Promise<ActionResult> {
  const { userId } = await requirePlatformAdmin()
  const db = createAdminClient()
  const { error } = await db
    .from('orgs')
    .update({ suspended_at: null } as never)
    .eq('id', orgId)
  if (error) return { ok: false, error: error.message }

  await writeAudit(db, userId, 'tenant.resume', orgId, null)
  revalidatePath(`/admin/tenants/${orgId}`)
  revalidatePath('/admin/tenants')
  return { ok: true }
}

async function ensureArchiveColumn(db: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const { error } = await db.rpc('exec_sql' as never, {
    query: 'ALTER TABLE public.orgs ADD COLUMN IF NOT EXISTS archived_at timestamptz',
  } as never)
  if (error) {
    // rpc may not exist — try a direct update with a dummy value to test
    const { error: testErr } = await db
      .from('orgs' as never)
      .update({ archived_at: null } as never)
      .eq('id', '00000000-0000-0000-0000-000000000000')
    return !testErr || !testErr.message.includes('archived_at')
  }
  return true
}

export async function archiveTenant(
  orgId: string,
  reason?: string | null,
): Promise<ActionResult> {
  const { userId } = await requirePlatformAdmin()
  const db = createAdminClient()

  const columnExists = await ensureArchiveColumn(db)
  if (!columnExists) {
    return { ok: false, error: 'Migration required: run migration 0025_archive_tenant.sql to enable archiving.' }
  }

  const { data: org } = await db
    .from('orgs' as never)
    .select('*')
    .eq('id', orgId)
    .maybeSingle<{ archived_at?: string | null }>()
  if (!org) return { ok: false, error: 'Tenant not found.' }
  if (org.archived_at) return { ok: false, error: 'Tenant is already archived.' }

  const { error } = await db
    .from('orgs')
    .update({ archived_at: new Date().toISOString(), suspended_at: new Date().toISOString() } as never)
    .eq('id', orgId)
  if (error) return { ok: false, error: error.message }

  await writeAudit(db, userId, 'tenant.archive', orgId, { reason: reason ?? null })
  revalidatePath(`/admin/tenants/${orgId}`)
  revalidatePath('/admin/tenants')
  revalidatePath('/admin/analytics')
  return { ok: true }
}

export async function restoreTenant(orgId: string): Promise<ActionResult> {
  const { userId } = await requirePlatformAdmin()
  const db = createAdminClient()

  const columnExists = await ensureArchiveColumn(db)
  if (!columnExists) {
    return { ok: false, error: 'Migration required: run migration 0025_archive_tenant.sql to enable restoring.' }
  }

  const { data: org } = await db
    .from('orgs' as never)
    .select('*')
    .eq('id', orgId)
    .maybeSingle<{ archived_at?: string | null }>()
  if (!org) return { ok: false, error: 'Tenant not found.' }
  if (!org.archived_at) return { ok: false, error: 'Tenant is not archived.' }

  const { error } = await db
    .from('orgs')
    .update({ archived_at: null, suspended_at: null } as never)
    .eq('id', orgId)
  if (error) return { ok: false, error: error.message }

  await writeAudit(db, userId, 'tenant.restore', orgId, null)
  revalidatePath(`/admin/tenants/${orgId}`)
  revalidatePath('/admin/tenants')
  revalidatePath('/admin/analytics')
  return { ok: true }
}

// ─── Invite additional platform admins (rare, but useful) ───────────

export async function inviteOrPromotePlatformAdmin(
  email: string,
  note?: string | null,
): Promise<ActionResult<{ userId: string; alreadyExisted: boolean }>> {
  const { userId: actorId } = await requirePlatformAdmin()

  const cleanEmail = email.trim().toLowerCase()
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { ok: false, error: 'Invalid email.' }
  }

  const db = createAdminClient()

  // Look up or create the auth user. We don't tie this to a specific
  // org — platform admins are cross-tenant.
  let userId: string | null = null
  let alreadyExisted = false

  const { data: list } = await db.auth.admin.listUsers()
  const existing = list?.users.find((u) => u.email?.toLowerCase() === cleanEmail)
  if (existing) {
    userId = existing.id
    alreadyExisted = true
  } else {
    const { data: invited, error } = await db.auth.admin.inviteUserByEmail(cleanEmail)
    if (error || !invited?.user) {
      return { ok: false, error: error?.message ?? 'Could not send invitation.' }
    }
    userId = invited.user.id
  }

  await db
    .from('profiles')
    .upsert({ id: userId, email: cleanEmail } as never)

  await db
    .from('platform_admins' as never)
    .upsert({
      user_id: userId,
      granted_at: new Date().toISOString(),
      granted_by: actorId,
      revoked_at: null,
      note: note ?? null,
    } as never)

  await writeAudit(db, actorId, 'platform_admin.grant', null, {
    target_user_id: userId,
    email: cleanEmail,
    note: note ?? null,
  })

  // Token-based invitation link straight to /admin so they land in
  // the platform UI on first sign-in.
  await sendEmail({
    to: cleanEmail,
    subject: 'You\'re a HomeownerHub platform admin',
    text: `You've been granted platform-admin access to HomeownerHub.

Sign in: ${appUrl('/admin')}

If you didn't expect this, contact the person who granted access.`,
    html: `<p>You've been granted platform-admin access to HomeownerHub.</p>
<p><a href="${appUrl('/admin')}">Sign in to the platform dashboard →</a></p>
<p style="font-size:12px;color:#666">If you didn't expect this, contact the person who granted access.</p>`,
  }).catch(() => {
    /* best-effort; row + audit are already written */
  })

  revalidatePath('/admin')
  return { ok: true, data: { userId: userId!, alreadyExisted } }
}

export async function revokePlatformAdmin(
  userId: string,
): Promise<ActionResult> {
  const { userId: actorId } = await requirePlatformAdmin()
  if (userId === actorId) {
    return {
      ok: false,
      error: 'You can\'t revoke your own platform-admin access. Grant someone else first.',
    }
  }

  const db = createAdminClient()
  const { error } = await db
    .from('platform_admins' as never)
    .update({ revoked_at: new Date().toISOString() } as never)
    .eq('user_id', userId)
  if (error) return { ok: false, error: error.message }

  // Belt-and-suspenders: refuse to revoke the last active platform admin.
  const { count } = await db
    .from('platform_admins' as never)
    .select('user_id', { count: 'exact', head: true })
    .is('revoked_at', null)
  if ((count ?? 0) === 0) {
    // Roll back; this would lock everyone out.
    await db
      .from('platform_admins' as never)
      .update({ revoked_at: null } as never)
      .eq('user_id', userId)
    return {
      ok: false,
      error: 'Refused — that\'s the last active platform admin. Grant someone else first.',
    }
  }

  await writeAudit(db, actorId, 'platform_admin.revoke', null, {
    target_user_id: userId,
  })
  revalidatePath('/admin')
  return { ok: true }
}
