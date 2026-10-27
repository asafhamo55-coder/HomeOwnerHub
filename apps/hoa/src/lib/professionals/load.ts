// BL-168 — reads for the professional pages and Settings → Professionals.
// Every professional read runs on the caller's OWN RLS client, so what a
// CPA or attorney sees is exactly what migration 0070 grants (an expired
// or unassigned professional reads nothing). Board reads of the access list
// use the service role only for profile names and emails (profiles RLS is
// own-row), after the page's board gate.

import { createAdminClient } from '@homeowner-portal/db'
import { loadOrFail } from '@/lib/load-or-fail'
import { readAllResult } from '@/lib/supabase/read-all'
import { readOfficerTitle, MATTER_LABEL, type MatterType, type OfficerTitle } from './model'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface ProfessionalRow {
  userId: string
  role: 'cpa' | 'attorney'
  email: string | null
  fullName: string | null
  accessExpiresAt: string | null
  generalCounsel: boolean
  matters: Array<{ assignmentId: string; type: MatterType; id: string }>
}

export async function loadProfessionals(db: Db, orgId: string): Promise<{ ok: true; rows: ProfessionalRow[] } | { ok: false }> {
  const members = await loadOrFail(
    'professionals: members',
    db
      .from('org_members')
      .select('user_id, role, access_expires_at, general_counsel')
      .eq('org_id', orgId)
      .in('role', ['cpa', 'attorney'])
      .order('invited_at', { ascending: true })
      .limit(200),
  )
  if (!members.ok) return { ok: false }
  const list = (members.data ?? []) as Array<{ user_id: string; role: 'cpa' | 'attorney'; access_expires_at: string | null; general_counsel: boolean | null }>
  if (list.length === 0) return { ok: true, rows: [] }

  const ids = list.map((m) => m.user_id)
  const [profiles, assignments] = await Promise.all([
    createAdminClient().from('profiles').select('id, email, full_name').in('id', ids),
    loadOrFail(
      'professionals: assignments',
      db.from('matter_assignments').select('id, user_id, matter_type, matter_id').eq('organization_id', orgId).is('revoked_at', null).limit(1000),
    ),
  ])
  if (profiles.error || !assignments.ok) return { ok: false }
  const byId = new Map((profiles.data ?? []).map((p) => [p.id, p]))
  const asg = (assignments.data ?? []) as Array<{ id: string; user_id: string; matter_type: MatterType; matter_id: string }>
  return {
    ok: true,
    rows: list.map((m) => ({
      userId: m.user_id,
      role: m.role,
      email: byId.get(m.user_id)?.email ?? null,
      fullName: byId.get(m.user_id)?.full_name ?? null,
      accessExpiresAt: m.access_expires_at,
      generalCounsel: m.general_counsel === true,
      matters: asg.filter((a) => a.user_id === m.user_id).map((a) => ({ assignmentId: a.id, type: a.matter_type, id: a.matter_id })),
    })),
  }
}

export interface MatterOption {
  type: MatterType
  id: string
  label: string
}

/** What the board can assign: open cases, recent violations, records requests. Labels carry a status, never a person's name. */
export async function loadMatterOptions(db: Db, orgId: string): Promise<{ ok: true; options: MatterOption[] } | { ok: false }> {
  const [cases, violations, records] = await Promise.all([
    loadOrFail('professionals: cases', db.from('collection_cases').select('id, status, opened_on').eq('organization_id', orgId).is('deleted_at', null).order('opened_on', { ascending: false }).limit(100)),
    loadOrFail('professionals: violations', db.from('hoa_violations').select('id, violation_type, status, created_at').eq('org_id', orgId).order('created_at', { ascending: false }).limit(100)),
    loadOrFail('professionals: records', db.from('tickets').select('id, status, created_at').eq('organization_id', orgId).eq('category', 'records_request').order('created_at', { ascending: false }).limit(100)),
  ])
  if (!cases.ok || !violations.ok || !records.ok) return { ok: false }
  const short = (id: string) => id.slice(0, 8)
  return {
    ok: true,
    options: [
      ...((cases.data ?? []) as Array<{ id: string; status: string; opened_on: string }>).map((c) => ({
        type: 'collections_case' as const,
        id: c.id,
        label: `${MATTER_LABEL.collections_case} ${short(c.id)} · ${c.status.replace(/_/g, ' ')} · opened ${c.opened_on}`,
      })),
      ...((violations.data ?? []) as Array<{ id: string; violation_type: string; status: string; created_at: string }>).map((v) => ({
        type: 'violation' as const,
        id: v.id,
        label: `${MATTER_LABEL.violation} ${short(v.id)} · ${v.violation_type} · ${v.status.replace(/_/g, ' ')}`,
      })),
      ...((records.data ?? []) as Array<{ id: string; status: string; created_at: string }>).map((r) => ({
        type: 'records_request' as const,
        id: r.id,
        label: `${MATTER_LABEL.records_request} ${short(r.id)} · ${r.status} · ${r.created_at.slice(0, 10)}`,
      })),
    ],
  }
}

export interface OfficerRow {
  userId: string
  email: string | null
  fullName: string | null
  title: OfficerTitle | null
}

export async function loadOfficers(db: Db, orgId: string): Promise<{ ok: true; rows: OfficerRow[] } | { ok: false }> {
  const members = await loadOrFail('professionals: board', db.from('org_members').select('user_id, officer_title').eq('org_id', orgId).eq('role', 'board').limit(100))
  if (!members.ok) return { ok: false }
  const list = (members.data ?? []) as Array<{ user_id: string; officer_title: string | null }>
  if (list.length === 0) return { ok: true, rows: [] }
  const profiles = await createAdminClient().from('profiles').select('id, email, full_name').in('id', list.map((m) => m.user_id))
  if (profiles.error) return { ok: false }
  const byId = new Map((profiles.data ?? []).map((p) => [p.id, p]))
  return {
    ok: true,
    rows: list.map((m) => ({
      userId: m.user_id,
      email: byId.get(m.user_id)?.email ?? null,
      fullName: byId.get(m.user_id)?.full_name ?? null,
      title: readOfficerTitle(m.officer_title),
    })),
  }
}

export async function loadDualControlCents(db: Db, orgId: string): Promise<number | null | 'error'> {
  const res = await loadOrFail('professionals: dual control', db.from('associations').select('dual_control_cents').eq('organization_id', orgId).not('dual_control_cents', 'is', null))
  if (!res.ok) return 'error'
  const cents = ((res.data ?? []) as Array<{ dual_control_cents: number | string }>).map((a) => Number(a.dual_control_cents))
  return cents.length > 0 ? Math.min(...cents) : null
}

// ─── the professional's own pages ────────────────────────────────────

export interface SubmissionRow {
  id: string
  actionType: string
  summary: string
  status: string
  proposedAt: string
  decisionReason: string | null
  amount: number | null
}

/** The caller's own proposals (approval_requests_select_proposer), newest first. */
export async function loadMySubmissions(db: Db, userId: string): Promise<{ ok: true; rows: SubmissionRow[] } | { ok: false }> {
  const res = await loadOrFail(
    'pro: submissions',
    db
      .from('approval_requests')
      .select('id, action_type, summary, status, proposed_at, decision_reason, amount')
      .eq('proposed_by', userId)
      .order('proposed_at', { ascending: false })
      .limit(100),
  )
  if (!res.ok) return { ok: false }
  return {
    ok: true,
    rows: ((res.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      actionType: String(r.action_type),
      summary: String(r.summary),
      status: String(r.status),
      proposedAt: String(r.proposed_at),
      decisionReason: (r.decision_reason as string | null) ?? null,
      amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
    })),
  }
}

export interface MyMatter {
  type: MatterType
  id: string
  title: string
  status: string
  since: string
}

export async function loadMyMatters(db: Db, orgId: string): Promise<{ ok: true; matters: MyMatter[] } | { ok: false }> {
  const [cases, violations, records] = await Promise.all([
    loadOrFail('pro: cases', db.from('collection_cases').select('id, status, opened_on').eq('organization_id', orgId).order('opened_on', { ascending: false }).limit(200)),
    loadOrFail('pro: violations', db.from('hoa_violations').select('id, violation_type, status, created_at').eq('org_id', orgId).order('created_at', { ascending: false }).limit(200)),
    loadOrFail('pro: records', db.from('tickets').select('id, status, created_at').eq('organization_id', orgId).eq('category', 'records_request').order('created_at', { ascending: false }).limit(200)),
  ])
  if (!cases.ok || !violations.ok || !records.ok) return { ok: false }
  return {
    ok: true,
    matters: [
      ...((cases.data ?? []) as Array<{ id: string; status: string; opened_on: string }>).map((c) => ({
        type: 'collections_case' as const, id: c.id, title: MATTER_LABEL.collections_case, status: c.status.replace(/_/g, ' '), since: c.opened_on,
      })),
      ...((violations.data ?? []) as Array<{ id: string; violation_type: string; status: string; created_at: string }>).map((v) => ({
        type: 'violation' as const, id: v.id, title: `${MATTER_LABEL.violation}: ${v.violation_type}`, status: v.status.replace(/_/g, ' '), since: v.created_at.slice(0, 10),
      })),
      ...((records.data ?? []) as Array<{ id: string; status: string; created_at: string }>).map((r) => ({
        type: 'records_request' as const, id: r.id, title: MATTER_LABEL.records_request, status: r.status, since: r.created_at.slice(0, 10),
      })),
    ],
  }
}

export interface MatterParty {
  ownerName: string | null
  address: string
}

/** The owner's name and the home's address for one assigned matter (and nothing else of the owner). */
export async function loadMatterParty(db: Db, orgId: string, type: MatterType, id: string): Promise<MatterParty | null> {
  const { data, error } = await db.rpc('attorney_matter_party', { p_org_id: orgId, p_matter_type: type, p_matter_id: id })
  if (error || !data || data.length === 0) return null
  const r = data[0] as { owner_name: string | null; address_line1: string | null; address_line2: string | null; city: string | null; state: string | null; postal_code: string | null }
  const address = [r.address_line1, r.address_line2, [r.city, r.state, r.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return { ownerName: r.owner_name, address }
}

export interface CpaOverview {
  periods: Array<{ id: string; associationId: string; start: string; end: string; status: string; reviewed: boolean }>
  receivables: Array<{ unitId: string; owner: string | null; openCents: number }>
  entries: Array<{ id: string; number: string; date: string; memo: string; status: string }>
  accounts: Array<{ id: string; label: string; associationId: string }>
  funds: Array<{ id: string; label: string; associationId: string }>
}

export async function loadCpaOverview(db: Db, orgId: string): Promise<{ ok: true; data: CpaOverview } | { ok: false }> {
  const [periods, assessments, entries, accounts, funds, owners, reviews] = await Promise.all([
    loadOrFail('pro: periods', db.from('fiscal_periods').select('id, association_id, start_date, end_date, status').eq('organization_id', orgId).order('start_date', { ascending: false }).limit(20)),
    // Every open charge, page by page: a summed total must never be a truncated one.
    loadOrFail(
      'pro: receivables',
      readAllResult<{ unit_id: string | null; amount: number | string }>((from, to) =>
        db.from('assessments').select('unit_id, amount, status').eq('organization_id', orgId).in('status', ['open', 'overdue', 'partial']).order('id').range(from, to),
      ),
    ),
    loadOrFail('pro: entries', db.from('journal_entries').select('id, entry_number, entry_date, memo, status').eq('organization_id', orgId).order('entry_date', { ascending: false }).limit(25)),
    loadOrFail('pro: accounts', db.from('chart_of_accounts').select('id, association_id, account_number, account_name').eq('organization_id', orgId).eq('is_active', true).order('account_number').limit(400)),
    loadOrFail('pro: funds', db.from('funds').select('id, association_id, code, name').eq('organization_id', orgId).eq('is_active', true).limit(50)),
    db.rpc('cpa_owner_names', { p_org_id: orgId }),
    loadOrFail('pro: reviews', db.from('approval_requests').select('payload').eq('organization_id', orgId).eq('action_type', 'pro.cpa_review').in('status', ['approved', 'posted']).limit(200)),
  ])
  if (!periods.ok || !assessments.ok || !entries.ok || !accounts.ok || !funds.ok || !reviews.ok || owners.error) return { ok: false }
  const reviewed = new Set(((reviews.data ?? []) as Array<{ payload: { fiscalPeriodId?: string } }>).map((r) => r.payload?.fiscalPeriodId))
  const ownerBy = new Map(((owners.data ?? []) as Array<{ unit_id: string; owner_name: string | null }>).map((o) => [o.unit_id, o.owner_name]))
  const open = new Map<string, number>()
  for (const a of (assessments.data ?? []) as Array<{ unit_id: string | null; amount: number | string }>) {
    if (!a.unit_id) continue
    open.set(a.unit_id, (open.get(a.unit_id) ?? 0) + Math.round(Number(a.amount) * 100))
  }
  return {
    ok: true,
    data: {
      periods: ((periods.data ?? []) as Array<{ id: string; association_id: string; start_date: string; end_date: string; status: string }>).map((p) => ({
        id: p.id, associationId: p.association_id, start: p.start_date, end: p.end_date, status: p.status, reviewed: reviewed.has(p.id),
      })),
      receivables: [...open.entries()].map(([unitId, openCents]) => ({ unitId, owner: ownerBy.get(unitId) ?? null, openCents })).sort((a, b) => b.openCents - a.openCents),
      entries: ((entries.data ?? []) as Array<{ id: string; entry_number: string; entry_date: string; memo: string; status: string }>).map((e) => ({
        id: e.id, number: e.entry_number, date: e.entry_date, memo: e.memo, status: e.status,
      })),
      accounts: ((accounts.data ?? []) as Array<{ id: string; association_id: string; account_number: string; account_name: string }>).map((a) => ({
        id: a.id, associationId: a.association_id, label: `${a.account_number} ${a.account_name}`,
      })),
      funds: ((funds.data ?? []) as Array<{ id: string; association_id: string; code: string; name: string }>).map((f) => ({
        id: f.id, associationId: f.association_id, label: `${f.code} ${f.name}`,
      })),
    },
  }
}

export interface PendingInvite {
  id: string
  email: string
  role: 'cpa' | 'attorney'
  accessExpiresOn: string
  linkExpiresAt: string
}

/** Invitations to existing accounts that nobody has accepted, cancelled or let lapse (board read). */
export async function loadPendingInvites(db: Db, orgId: string): Promise<{ ok: true; rows: PendingInvite[] } | { ok: false }> {
  const res = await loadOrFail(
    'professionals: pending invites',
    db
      .from('professional_invites')
      .select('id, email, role, access_expires_on, link_expires_at')
      .eq('organization_id', orgId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('link_expires_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(100),
  )
  if (!res.ok) return { ok: false }
  return {
    ok: true,
    rows: ((res.data ?? []) as Array<{ id: string; email: string; role: 'cpa' | 'attorney'; access_expires_on: string; link_expires_at: string }>).map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      accessExpiresOn: r.access_expires_on,
      linkExpiresAt: r.link_expires_at,
    })),
  }
}
