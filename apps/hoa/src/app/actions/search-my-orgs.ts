'use server'

import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  SWITCHER_SEARCH_MAX_CHARS,
  SWITCHER_SEARCH_PAGE_SIZE,
  escapeLike,
} from '@/lib/org-switcher'

export interface OrgSearchHit {
  id: string
  name: string
  doors_count: number | null
}

export type OrgSearchResult =
  | { ok: true; orgs: OrgSearchHit[]; hasMore: boolean }
  | { ok: false; reason: string }

/**
 * Finds the signed-in user's own communities by name, one page at a time,
 * for the org switcher of someone who belongs to too many to list. Always
 * filtered on the caller's user id (org_members' policies also expose
 * co-members' rows) and on the HOA hub, never more than one page of
 * SWITCHER_SEARCH_PAGE_SIZE rows, ordered by name so paging is stable.
 * An empty query lists the first page alphabetically.
 */
export async function searchMyOrgs(query: string, page = 0): Promise<OrgSearchResult> {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: 'Please sign in again.' }

  const text = String(query ?? '').trim().slice(0, SWITCHER_SEARCH_MAX_CHARS)
  const safePage = Number.isInteger(page) && page >= 0 && page < 10_000 ? page : 0
  const from = safePage * SWITCHER_SEARCH_PAGE_SIZE

  let q = supabase
    .from('org_members')
    .select('org_id, org:orgs!inner(id, name, doors_count)')
    .eq('user_id', user.id)
    .eq('org.hub_type', 'hoa')
  if (text) q = q.ilike('org.name', `%${escapeLike(text)}%`)
  // One extra row tells us whether another page exists.
  const { data, error } = await q
    .order('org(name)', { ascending: true })
    .order('org_id', { ascending: true })
    .range(from, from + SWITCHER_SEARCH_PAGE_SIZE)
  if (error) return { ok: false, reason: 'We could not search just now. Please try again.' }

  const rows = (data as unknown as Array<{ org: OrgSearchHit | null }> | null) ?? []
  const orgs = rows
    .slice(0, SWITCHER_SEARCH_PAGE_SIZE)
    .flatMap((r) => (r.org ? [{ id: r.org.id, name: r.org.name, doors_count: r.org.doors_count }] : []))
  return { ok: true, orgs, hasMore: rows.length > SWITCHER_SEARCH_PAGE_SIZE }
}
