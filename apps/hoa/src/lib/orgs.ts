import { cache } from 'react'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'
import { M6_APPLIED } from '@homeowner-portal/db/m6'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { grantExpired, isProfessionalRole } from '@/lib/roles'
import { timed } from '@/lib/perf/timing'
import { SWITCHER_SEARCH_THRESHOLD } from '@/lib/org-switcher'

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
  // Timed (BL-099 follow-up): the auth-server round trip every page render
  // pays once. Logged when slow, or always with PERF_LOG=1; no ids.
  const {
    data: { user },
  } = await timed('auth', 'auth.getUser', () => supabase.auth.getUser())
  return user ?? null
})

/**
 * How many memberships the per-request page read returns: one more than the
 * switcher shows inline, so "more than 8" is known without counting. A user
 * in hundreds of orgs (a management company) never loads them all on a
 * normal request: the active org is resolved by a direct lookup and the
 * rest are found by the switcher's search.
 */
const MEMBERSHIP_PAGE = SWITCHER_SEARCH_THRESHOLD + 1

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

const MEMBER_SELECT = M6_APPLIED
  ? 'org_id, role, access_expires_at, officer_title, general_counsel, org:orgs(id, name, hub_type, plan, doors_count)'
  : 'org_id, role, org:orgs(id, name, hub_type, plan, doors_count)'

/**
 * BL-168: a professional cannot read the orgs table (every column of it,
 * billing ids included); pro_org_info() returns the name, and only the
 * name once their grant has ended.
 */
async function fillProfessionalOrgs(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  rows: MembershipRow[],
): Promise<void> {
  if (!M6_APPLIED) return
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

/**
 * The first page of the signed-in user's memberships (oldest first), read
 * ONCE per request, plus how many memberships they have in all. `complete`
 * means the page holds every membership, so a miss in it is a real "not a
 * member". `rows: null` means the read failed.
 */
const membershipPage = cache(
  async (): Promise<{ userId: string; rows: MembershipRow[] | null; total: number; complete: boolean } | null> => {
    const user = await getSignedInUser()
    if (!user) return null
    const supabase = await getSupabaseServerClient()
    const { data, error, count } = await timed('auth', 'auth.memberships', () =>
      supabase
        .from('org_members')
        .select(MEMBER_SELECT, { count: 'exact' })
        .eq('user_id', user.id)
        .order('joined_at', { ascending: true })
        .limit(MEMBERSHIP_PAGE),
    )
    if (error || !data) return { userId: user.id, rows: null, total: 0, complete: false }
    const rows = data as unknown as MembershipRow[]
    await fillProfessionalOrgs(supabase, rows)
    const total = typeof count === 'number' ? Math.max(count, rows.length) : rows.length
    return { userId: user.id, rows, total, complete: rows.length < MEMBERSHIP_PAGE && rows.length >= total }
  },
)

/**
 * One membership of the signed-in user, by org id: a single indexed row,
 * however many orgs they belong to. Memoized per request and org.
 */
const membershipIn = cache(async (orgId: string): Promise<MembershipRow | null> => {
  const user = await getSignedInUser()
  if (!user) return null
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('org_members')
    .select(MEMBER_SELECT)
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  const row = data as unknown as MembershipRow
  await fillProfessionalOrgs(supabase, [row])
  return row
})

/**
 * The signed-in user's raw role string in `orgId`, or null (not a member /
 * signed out). Memoized per request.
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
 * included, or null (not a member / signed out). Answered from the page
 * read when that page is known to be complete (the usual one-to-eight org
 * user, no extra query); otherwise by a direct one-row read. Memoized per
 * request. Without M6_APPLIED the extra columns are never selected (they
 * may not exist yet) and nothing is expired.
 */
export const getMembershipDetail = cache(async (orgId: string): Promise<MembershipDetail | null> => {
  const page = await membershipPage()
  if (!page) return null
  const toDetail = (r: {
    role: string | null
    access_expires_at?: string | null
    officer_title?: string | null
    general_counsel?: boolean | null
  }): MembershipDetail => ({
    role: r.role,
    officerTitle: M6_APPLIED ? (r.officer_title ?? null) : null,
    accessExpiresAt: M6_APPLIED ? (r.access_expires_at ?? null) : null,
    generalCounsel: M6_APPLIED && r.general_counsel === true,
    expired: M6_APPLIED && isProfessionalRole(r.role) && grantExpired(r.access_expires_at ?? null),
  })
  if (page.rows) {
    const row = page.rows.find((r) => r.org_id === orgId)
    if (row) return toDetail(row)
    if (page.complete) return null
  }
  const direct = await membershipIn(orgId)
  return direct ? toDetail(direct) : null
})

// Resolution order for the active HOA org:
//   1. Cookie `hoa_active_org_id` (set by the switcher), iff the user is
//      a member of that org and it's an HOA hub. Checked with ONE
//      membership lookup filtered on that org id, so a user in hundreds of
//      orgs does not load them all to find the one they are in.
//   2. First HOA org by `joined_at` ascending (legacy default).
// Returns null if the user has no HOA org membership.
export async function getCurrentOrg(): Promise<CurrentOrg | null> {
  const cookieStore = await cookies()
  const wanted = cookieStore.get(ACTIVE_ORG_COOKIE)?.value
  if (wanted) {
    const row = await membershipIn(wanted)
    if (row?.org && row.org.hub_type === 'hoa') return row.org
    // Cookie points to an org the user no longer has access to (or one that
    // is not an HOA) — ignore and fall through. The next setActiveOrg call
    // will replace it.
  }

  const page = await membershipPage()
  if (!page?.rows) return null
  for (const row of page.rows) {
    if (row.org && row.org.hub_type === 'hoa') return row.org
  }
  if (page.complete) return null

  // None of the oldest few memberships is an HOA (a user with many other
  // hubs): ask for the first HOA directly.
  const user = await getSignedInUser()
  if (!user) return null
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('org_members')
    .select('org_id, org:orgs!inner(id, name, hub_type, plan, doors_count)')
    .eq('user_id', user.id)
    .eq('org.hub_type', 'hoa')
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  const org = (data as unknown as { org: CurrentOrg | null } | null)?.org
  return org ?? null
}

// The first few HOA orgs the user belongs to (all of them when they have
// eight or fewer). Powers the in-app org switcher's plain list; a user in
// more orgs than that gets the search box instead (see getUserOrgCount).
export async function getUserHoaOrgs(): Promise<UserHoaOrg[]> {
  const page = await membershipPage()
  if (!page?.rows) return []

  const seen = new Set<string>()
  const out: UserHoaOrg[] = []
  for (const row of page.rows) {
    const org = row.org
    if (!org || org.hub_type !== 'hoa' || seen.has(org.id)) continue
    seen.add(org.id)
    out.push({ id: org.id, name: org.name, doors_count: org.doors_count })
  }
  return out
}

/**
 * How many orgs the user belongs to (any hub; for the switcher this is the
 * "do we need a search box" test, so a few non-HOA orgs only make it err
 * toward showing the box). 0 when signed out or the read failed.
 */
export async function getUserOrgCount(): Promise<number> {
  const page = await membershipPage()
  return page?.rows ? page.total : 0
}

// All hubs the user has any org in. Powers the cross-app hub switcher.
export async function getUserHubs(): Promise<UserHub[]> {
  const page = await membershipPage()
  if (!page) return []

  const seen = new Set<string>()
  const hubs: UserHub[] = []
  const add = (org: { hub_type: string; name: string } | null | undefined) => {
    if (!org || seen.has(org.hub_type)) return
    if (org.hub_type === 'hoa' || org.hub_type === 'eviction' || org.hub_type === 'pm') {
      seen.add(org.hub_type)
      hubs.push({ type: org.hub_type, orgName: org.name })
    }
  }
  for (const row of page.rows ?? []) add(row.org)

  // A user past the first page may also run a pm or eviction org: one small
  // read for the non-HOA ones, instead of loading every membership.
  if (page.rows && !page.complete) {
    const supabase = await getSupabaseServerClient()
    const { data } = await supabase
      .from('org_members')
      .select('org:orgs!inner(name, hub_type)')
      .eq('user_id', page.userId)
      .neq('org.hub_type', 'hoa')
      .order('joined_at', { ascending: true })
      .limit(MEMBERSHIP_PAGE)
    for (const row of (data as unknown as Array<{ org: { hub_type: string; name: string } | null }> | null) ?? []) {
      add(row.org)
    }
  }
  return hubs
}
