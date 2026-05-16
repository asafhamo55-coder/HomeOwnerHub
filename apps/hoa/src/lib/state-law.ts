'use server'

import { askStateLaw, type StateLawBrainOutput } from '@homeowner-portal/workflows'
import { getCurrentOrg } from '@/lib/orgs'
import { getPrimaryAssociation } from '@/lib/vendors'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export type SupportedState = 'GA' | 'FL' | 'CA' | 'TX'

const SUPPORTED: SupportedState[] = ['GA', 'FL', 'CA', 'TX']

function isSupportedState(s: string | null | undefined): s is SupportedState {
  return s != null && (SUPPORTED as string[]).includes(s)
}

export interface StatuteRow {
  id: string
  code_citation: string
  title: string
  category: string | null
  effective_date: string | null
}

export interface StatuteDetail extends StatuteRow {
  body: string
  source_url: string | null
  fetched_at: string
}

export interface StateLawSummary {
  state: SupportedState | null
  associationName: string | null
  statuteCount: number
  categories: Array<{ category: string; count: number }>
  recentUpdateCount: number
}

export interface LawUpdateRow {
  id: string
  headline: string
  summary: string
  action_items: string[] | null
  category: string | null
  effective_date: string | null
  source_url: string | null
  related_statute_id: string | null
  posted_at: string
}

type ActionOk<T> = T extends void ? { ok: true } : { ok: true; data: T }
type ActionErr = { ok: false; error: string }
export type ActionResult<T = void> = ActionOk<T> | ActionErr

// ─── Reads ───────────────────────────────────────────────────────────

// Returns the state of the user's primary association. If the
// association is in a state we don't yet support (i.e. not GA/FL/CA/TX),
// returns null and the UI shows an "unsupported state" empty state
// instead of pretending we have laws for it.
export async function getAssociationState(): Promise<SupportedState | null> {
  const assoc = await getPrimaryAssociation()
  if (!assoc) return null
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('associations' as never)
    .select('state')
    .eq('id', assoc.id)
    .maybeSingle<{ state: string }>()
  if (!data?.state) return null
  return isSupportedState(data.state) ? data.state : null
}

export async function getStateLawSummary(): Promise<StateLawSummary> {
  const assoc = await getPrimaryAssociation()
  const state = await getAssociationState()

  if (!state) {
    return {
      state: null,
      associationName: assoc?.name ?? null,
      statuteCount: 0,
      categories: [],
      recentUpdateCount: 0,
    }
  }

  const supabase = await getSupabaseServerClient()
  const [{ data: rows }, { count: updateCount }] = await Promise.all([
    supabase
      .from('state_statutes' as never)
      .select('category')
      .eq('state', state)
      .is('superseded_at', null),
    supabase
      .from('state_law_updates' as never)
      .select('id', { count: 'exact', head: true })
      .eq('state', state)
      .is('archived_at', null),
  ])

  const items = (rows ?? []) as unknown as Array<{ category: string | null }>
  const counts = new Map<string, number>()
  for (const r of items) {
    const cat = r.category ?? 'uncategorized'
    counts.set(cat, (counts.get(cat) ?? 0) + 1)
  }

  return {
    state,
    associationName: assoc?.name ?? null,
    statuteCount: items.length,
    categories: Array.from(counts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    recentUpdateCount: updateCount ?? 0,
  }
}

export async function listRecentUpdates(
  state: SupportedState,
  limit = 20,
): Promise<LawUpdateRow[]> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('state_law_updates' as never)
    .select(
      'id, headline, summary, action_items, category, effective_date, source_url, related_statute_id, posted_at',
    )
    .eq('state', state)
    .is('archived_at', null)
    .order('posted_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as unknown as LawUpdateRow[]
}

export async function listStatutesForState(
  state: SupportedState,
  category?: string,
): Promise<StatuteRow[]> {
  const supabase = await getSupabaseServerClient()
  let query = supabase
    .from('state_statutes' as never)
    .select('id, code_citation, title, category, effective_date')
    .eq('state', state)
    .is('superseded_at', null)
    .order('code_citation', { ascending: true })
    .limit(500)
  if (category) query = query.eq('category', category)
  const { data } = await query
  return (data ?? []) as unknown as StatuteRow[]
}

export async function getStatute(id: string): Promise<StatuteDetail | null> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('state_statutes' as never)
    .select(
      'id, state, code_citation, title, category, effective_date, body, source_url, fetched_at',
    )
    .eq('id', id)
    .maybeSingle()
  return (data as unknown as StatuteDetail) ?? null
}

// ─── Q&A ─────────────────────────────────────────────────────────────

export async function askStateLawAction(
  question: string,
): Promise<ActionResult<StateLawBrainOutput & { runId: string }>> {
  const trimmed = question.trim()
  if (trimmed.length < 3) {
    return { ok: false, error: 'Question is too short.' }
  }
  if (trimmed.length > 2000) {
    return { ok: false, error: 'Question is too long (>2000 chars).' }
  }

  const state = await getAssociationState()
  if (!state) {
    return {
      ok: false,
      error: "Your association's state isn't supported yet (v1 covers GA, FL, CA, TX).",
    }
  }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  try {
    const result = await askStateLaw(trimmed, state, { organizationId: org.id })
    return { ok: true, data: result }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Q&A failed.',
    }
  }
}
