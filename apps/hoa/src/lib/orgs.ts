import { cache } from 'react'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'
import { M6_APPLIED } from '@homeowner-portal/db/m6'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { grantExpired, isProfessionalRole } from '@/lib/roles'

export interface CurrentOrg {
  id: string
  name: string
  hub_type: string
  plan: string
  doors_count: number | null
}

export interface UserHub {
  type: 'hoa' | 'eviction' | 'pm'
  orgName: string
}

export interface UserHoaOrg {
  id: string
  name: string
  doors_count: number | null
}

export const ACTIVE_ORG_COOKIE = 'hoa_active_org_id'

// Every org_members read below filters on the signed-in user's id. RLS
// would scope it anyway for most callers, but org_members' policies also
// expose co-members' rows (an admin sees their whole org), so an unfiltered
// `.limit(20)` returned OTHER people's memberships — and with them other
// orgs — once an org had enough members to push the caller's own rows out.

/**
 * The signed-in user, memoized per request (React cache). getUser is a
 * round trip to the auth server; a board page used to make it from the
 * layout, the page, the bell and every role check — in series. Use this in
 * render paths instead of `supabase.auth.getUser()`. (Outside a server
 * render — route handlers, server actions — React does not memoize, so it
 * is simply a getUser call.)
 */
export const getSignedInUser = cache(async (): Promise<User | null> => {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user ?? null
})

/** How many memberships one read returns. A user in more orgs than this
 *  gets a direct read for a role lookup past the list (getMembershipRole). */
const MEMBERSHIP_LIMIT = 20

interface MembershipRow {
  org_id: string
  role: string | null
  /** BL-168 (M6_APPLIED only): when a cpa/attorney grant ends. */
  access_expires_at?: string | null
  /** BL-168 (M6_APPLIED only): a board member's officer title. */
  officer_title?: string | null
  general_counsel?: boolean | null
  org: { id: string; name: string; hub_type: string; plan: string; doors_count: number | null } | null
}

/**
 * The signed-in user's memberships (oldest first), read ONCE per request:
 * getCurrentOrg, getUserHoaOrgs, getUserHubs and getMembershipRole all
 * answer from it. They used to be three identical org_members reads plus a
 * role read per check. `rows: null` means the read failed.
 */
const membershipRows = cache(async (): Promise<{ userId: string; rows: MembershipRow[] | null } | null> => {
  const user = await getSignedInUser()
  if (!user) return null
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('org_members')
    .select(
      M6_APPLIED
        ? 'org_id, role, access_expires_at, officer_title, general_counsel, org:orgs(id, name, hub_type, plan, doors_count)'
        : 'org_id, role, org:orgs(id, name, hub_type, plan, doors_count)',
    )
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true })
    .limit(MEMBERSHIP_LIMIT)
  if (error || !data) return { userId: user.id, rows: null }
  const rows = data as unknown as MembershipRow[]
  // BL-168: a professional cannot read the orgs table (every column of it,
  // billing ids included); pro_org_info() returns the name, and only the
  // name once their grant has ended.
  if (M6_APPLIED) {
    await Promise.all(
      rows
        .filter((r) => !r.org && isProfessionalRole(r.role))
        .map(async (r) => {
          const { data: info } = await supabase.rpc('pro_org_info' as never, { p_org_id: r.org_id } as never)
          const first = (info as unknown as Array<{ org_name: string }> | null)?.[0]
          if (first) r.org = { id: r.org_id, name: first.org_name, hub_type: 'hoa', plan: 'free', doors_count: null }
        }),
    )
  }
  return { userId: user.id, rows }
})

/**
 * The signed-in user's raw role string in `orgId`, or null (not a member /
 * signed out). Answered from the membership read when that list is known to
 * be complete; otherwise (read failed, or the list hit its limit) by the
 * direct one-row read this replaced. Memoized per request.
 */
export const getMembershipRole = cache(async (orgId: string): Promise<string | null> => {
  const detail = await getMembershipDetail(orgId)
  if (!detail) return null
  // An expired professional grant is no access (BL-168): no role at all.
  if (detail.expired) return null
  return detail.role
})

export interface MembershipDetail {
  role: string | null
  officerTitle: string | null
  accessExpiresAt: string | null
  /** An attorney the board gave governing documents and the compliance record. */
  generalCounsel: boolean
  /** A cpa/attorney grant past its end (always false for member roles and with M6 off). */
  expired: boolean
}

/**
 * The signed-in user's membership in `orgId`, expiry and officer title
 * included, or null (not a member / signed out). Answered from the one
 * membership read when that list is known to be complete; otherwise by a
 * direct one-row read. Memoized per request. Without M6_APPLIED the extra
 * columns are never selected (they may not exist yet) and nothing is
 * expired.
 */
export const getMembershipDetail = cache(async (orgId: string): Promise<MembershipDetail | null> => {
  const membership = await membershipRows()
  if (!membership) return null
  const { rows, userId } = membership
  const toDetail = (r: { role: string | null; access_expires_at?: string | null; officer_title?: string | null; general_counsel?: boolean | null }): MembershipDetail => ({
    role: r.role,
    officerTitle: M6_APPLIED ? (r.officer_title ?? null) : null,
    accessExpiresAt: M6_APPLIED ? (r.access_expires_at ?? null) : null,
    generalCounsel: M6_APPLIED && r.general_counsel === true,
    expired: M6_APPLIED && isProfessionalRole(r.role) && grantExpired(r.access_expires_at ?? null),
  })
  if (rows) {
    const row = rows.find((r) => r.org_id === orgId)
    if (row) return toDetail(row)
    if (rows.length < MEMBERSHIP_LIMIT) return null
  }
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('org_members')
    .select(M6_APPLIED ? 'role, access_expires_at, officer_title, general_counsel' : 'role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle<{ role: string | null; access_expires_at?: string | null; officer_title?: string | null; general_counsel?: boolean | null }>()
  return data ? toDetail(data) : null
})

// Resolution order for the active HOA org:
//   1. Cookie `hoa_active_org_id` (set by the switcher), iff the user is
//      a member of that org and it's an HOA hub.
//   2. First HOA org by `joined_at` ascending (legacy default).
// Returns null if the user has no HOA org membership.
export async function getCurrentOrg(): Promise<CurrentOrg | null> {
  const membership = await membershipRows()
  if (!membership?.rows) return null

  const hoaOrgs: CurrentOrg[] = []
  for (const row of membership.rows) {
    const org = row.org
    if (org && org.hub_type === 'hoa') hoaOrgs.push(org)
  }
  if (hoaOrgs.length === 0) return null

  const cookieStore = await cookies()
  const wanted = cookieStore.get(ACTIVE_ORG_COOKIE)?.value
  if (wanted) {
    const match = hoaOrgs.find((o) => o.id === wanted)
    if (match) return match
    // Cookie points to an org the user no longer has access to — ignore
    // and fall through. The next setActiveOrg call will replace it.
  }
  return hoaOrgs[0]
}

// All HOA orgs the user belongs to. Powers the in-app org switcher.
export async function getUserHoaOrgs(): Promise<UserHoaOrg[]> {
  const membership = await membershipRows()
  if (!membership?.rows) return []

  const seen = new Set<string>()
  const out: UserHoaOrg[] = []
  for (const row of membership.rows) {
    const org = row.org
    if (!org || org.hub_type !== 'hoa' || seen.has(org.id)) continue
    seen.add(org.id)
    out.push({ id: org.id, name: org.name, doors_count: org.doors_count })
  }
  return out
}

// All hubs the user has any org in. Powers the cross-app hub switcher.
export async function getUserHubs(): Promise<UserHub[]> {
  const membership = await membershipRows()
  if (!membership) return []

  const seen = new Set<string>()
  const hubs: UserHub[] = []
  for (const row of membership.rows ?? []) {
    const org = row.org
    if (!org || seen.has(org.hub_type)) continue
    if (org.hub_type === 'hoa' || org.hub_type === 'eviction' || org.hub_type === 'pm') {
      seen.add(org.hub_type)
      hubs.push({ type: org.hub_type, orgName: org.name })
    }
  }
  return hubs
}
