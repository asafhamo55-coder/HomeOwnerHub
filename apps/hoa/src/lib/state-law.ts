'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { askStateLaw, type StateLawBrainOutput } from '@homeowner-portal/workflows'
import { getPrimaryAssociation } from '@/lib/vendors'
import { createAdminClient } from '@homeowner-portal/db'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform-admin'
import { chargeAiActionQuota } from '@/lib/api/ai-action-quota'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'

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

export interface LawUpdateAdminRow extends LawUpdateRow {
  state: SupportedState
  archived_at: string | null
}

const UPDATE_CATEGORIES = [
  'meetings',
  'assessments',
  'fines',
  'foreclosure',
  'records',
  'architectural',
  'fair_housing',
  'amendments',
  'uncategorized',
] as const

type ActionOk<T> = T extends void ? { ok: true } : { ok: true; data: T }
type ActionErr = {
  ok: false
  error: string
  /** Per-field validation messages, keyed by form field name. */
  fieldErrors?: Record<string, string>
}
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
  const { data, error } = await supabase
    .from('associations' as never)
    .select('state')
    .eq('id', assoc.id)
    .maybeSingle<{ state: string }>()
  // A failed read is not "unsupported state" — throw so the page can say
  // it couldn't load (tryLoad) instead of claiming the state is missing.
  if (error) throw new Error(`associations.state: ${error.code ?? 'error'}`)
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
  const [{ data: rows, error: rowsError }, { count: updateCount, error: countError }] = await Promise.all([
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

  if (rowsError) throw new Error(`state_statutes: ${rowsError.code ?? 'error'}`)
  if (countError) throw new Error(`state_law_updates count: ${countError.code ?? 'error'}`)
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

/** Live (not superseded) statutes on file for the state. Throws on a failed
 *  read, so a page can say it couldn't check rather than "not loaded". */
export async function countLiveStatutesForState(state: SupportedState): Promise<number> {
  const supabase = await getSupabaseServerClient()
  const { count, error } = await supabase
    .from('state_statutes')
    .select('id', { count: 'exact', head: true })
    .eq('state', state)
    .is('superseded_at', null)
  if (error || count === null) throw new Error(`state_statutes count: ${error?.code ?? 'no count'}`)
  return count
}

export async function listRecentUpdates(
  state: SupportedState,
  limit = 20,
): Promise<LawUpdateRow[]> {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('state_law_updates' as never)
    .select(
      'id, headline, summary, action_items, category, effective_date, source_url, related_statute_id, posted_at',
    )
    .eq('state', state)
    .is('archived_at', null)
    .is('deleted_at', null)
    .order('posted_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`state_law_updates: ${error.code ?? 'error'}`)
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
  const { data, error } = await query
  if (error) throw new Error(`state_statutes: ${error.code ?? 'error'}`)
  return (data ?? []) as unknown as StatuteRow[]
}

export async function getStatute(id: string): Promise<StatuteDetail | null> {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('state_statutes' as never)
    .select(
      'id, state, code_citation, title, category, effective_date, body, source_url, fetched_at',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`state_statutes: ${error.code ?? 'error'}`)
  return (data as unknown as StatuteDetail) ?? null
}

// ─── Manager: post / archive law updates ─────────────────────────────

export async function listAllUpdatesForManager(
  state: SupportedState,
): Promise<LawUpdateAdminRow[]> {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('state_law_updates' as never)
    .select(
      'id, state, headline, summary, action_items, category, effective_date, source_url, related_statute_id, posted_at, archived_at',
    )
    .eq('state', state)
    .is('deleted_at', null)
    .order('posted_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(`state_law_updates: ${error.code ?? 'error'}`)
  return (data ?? []) as unknown as LawUpdateAdminRow[]
}

const CreateUpdateSchema = z.object({
  headline: z.string().trim().min(5, 'Headline is too short.').max(200),
  summary: z.string().trim().min(20, 'Summary should be at least 20 chars.').max(4000),
  action_items: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  category: z.enum(UPDATE_CATEGORIES).nullable().optional(),
  effective_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Effective date must be YYYY-MM-DD.')
    .nullable()
    .optional(),
  source_url: z
    .string()
    .url('Source URL must be a valid URL.')
    .nullable()
    .optional()
    .or(z.literal('')),
  related_statute_id: z.string().uuid().nullable().optional(),
})

export interface CreateLawUpdateInput {
  headline: string
  summary: string
  actionItems: string[]
  category?: string | null
  effectiveDate?: string | null
  sourceUrl?: string | null
  relatedStatuteId?: string | null
  /** The state the note is about. Defaults to the caller's association state. */
  state?: SupportedState
}

/** BL-175b H5: law updates are one platform-wide feed, so only the platform
 *  team edits it (migration 0070 drops the board's write policies). Boards
 *  keep read-only. Refusals are plain text; no database error is surfaced. */
const LAW_UPDATES_PLATFORM_ONLY = 'Only the platform team can edit law updates.'

export async function createLawUpdate(
  input: CreateLawUpdateInput,
): Promise<ActionResult<{ updateId: string }>> {
  const parsed = CreateUpdateSchema.safeParse({
    headline: input.headline,
    summary: input.summary,
    action_items: input.actionItems,
    category: input.category ?? null,
    effective_date: input.effectiveDate ?? null,
    source_url: input.sourceUrl ?? '',
    related_statute_id: input.relatedStatuteId ?? null,
  })
  if (!parsed.success) {
    // Keyed by the form's field names so the form can show each message
    // under its field. Validation itself is unchanged.
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '')
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input.',
      fieldErrors,
    }
  }

  if (!(await isPlatformAdmin())) return { ok: false, error: LAW_UPDATES_PLATFORM_ONLY }
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  let state: SupportedState | null = input.state && isSupportedState(input.state) ? input.state : null
  if (!state) {
    try {
      state = await getAssociationState()
    } catch {
      return { ok: false, error: "Couldn't check your association's state. Try again." }
    }
  }
  if (!state) {
    return { ok: false, error: 'Pick a supported state (GA, FL, CA or TX).' }
  }

  const db = createAdminClient()
  const { data: row, error } = await db
    .from('state_law_updates' as never)
    .insert({
      state,
      headline: parsed.data.headline,
      summary: parsed.data.summary,
      action_items: parsed.data.action_items.length > 0 ? parsed.data.action_items : null,
      category: parsed.data.category ?? null,
      effective_date: parsed.data.effective_date || null,
      source_url: parsed.data.source_url || null,
      related_statute_id: parsed.data.related_statute_id ?? null,
      posted_by: user.id,
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (error || !row) {
    return { ok: false, error: error?.message ?? 'Could not save update.' }
  }

  revalidatePath('/legal')
  revalidatePath('/legal/updates')
  revalidatePath('/')
  return { ok: true, data: { updateId: row.id } }
}

export async function archiveLawUpdate(id: string): Promise<ActionResult> {
  if (!(await isPlatformAdmin())) return { ok: false, error: LAW_UPDATES_PLATFORM_ONLY }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('state_law_updates' as never)
    .update({ archived_at: new Date().toISOString() } as never)
    .eq('id', id)
    .is('archived_at', null)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/legal')
  revalidatePath('/legal/updates')
  return { ok: true }
}

export async function deleteLawUpdate(id: string): Promise<ActionResult> {
  if (!(await isPlatformAdmin())) return { ok: false, error: LAW_UPDATES_PLATFORM_ONLY }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('state_law_updates' as never)
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', id)
    .is('deleted_at', null)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/legal')
  revalidatePath('/legal/updates')
  return { ok: true }
}

export async function updateLawUpdate(
  id: string,
  input: Partial<CreateLawUpdateInput>,
): Promise<ActionResult> {
  if (!(await isPlatformAdmin())) return { ok: false, error: LAW_UPDATES_PLATFORM_ONLY }
  const patch: Record<string, unknown> = {}
  if (input.headline !== undefined) patch.headline = input.headline
  if (input.summary !== undefined) patch.summary = input.summary
  if (input.actionItems !== undefined) patch.action_items = input.actionItems.length > 0 ? input.actionItems : null
  if (input.category !== undefined) patch.category = input.category ?? null
  if (input.effectiveDate !== undefined) patch.effective_date = input.effectiveDate || null
  if (input.sourceUrl !== undefined) patch.source_url = input.sourceUrl || null

  if (Object.keys(patch).length === 0) return { ok: true }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('state_law_updates' as never)
    .update(patch as never)
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/legal')
  revalidatePath('/legal/updates')
  return { ok: true }
}

export async function unarchiveLawUpdate(id: string): Promise<ActionResult> {
  if (!(await isPlatformAdmin())) return { ok: false, error: LAW_UPDATES_PLATFORM_ONLY }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('state_law_updates' as never)
    .update({ archived_at: null } as never)
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/legal')
  revalidatePath('/legal/updates')
  return { ok: true }
}

// ─── Q&A ─────────────────────────────────────────────────────────────

export async function askStateLawAction(
  question: string,
): Promise<ActionResult<StateLawBrainOutput & { runId: string }>> {
  // M-1: board/admin before any read or the `board_ai` quota charge.
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }

  if (typeof question !== 'string') return { ok: false, error: 'Question is too short.' }
  const trimmed = question.trim()
  if (trimmed.length < 3) {
    return { ok: false, error: 'Question is too short.' }
  }
  if (trimmed.length > 2000) {
    return { ok: false, error: 'Question is too long (>2000 chars).' }
  }

  let state: SupportedState | null
  try {
    state = await getAssociationState()
  } catch {
    return { ok: false, error: "Couldn't check your association's state. Try again." }
  }
  if (!state) {
    return {
      ok: false,
      error: "Your association's state isn't supported yet (v1 covers GA, FL, CA, TX).",
    }
  }

  // BL-112: the board's State Law Q&A (W30) → `board_ai`.
  const quota = await chargeAiActionQuota('board_ai', gate.orgId)
  if (!quota.ok) return { ok: false, error: quota.error }

  try {
    const result = await askStateLaw(trimmed, state, { organizationId: gate.orgId })
    return { ok: true, data: result }
  } catch (err) {
    // Fixed string only: workflow messages can carry ids and DB text.
    const code = err instanceof Error ? (err.message.split(':')[0] ?? 'error') : 'error'
    console.error('[state-law] askStateLawAction failed', { code })
    return { ok: false, error: 'The question could not be answered. Try again.' }
  }
}
