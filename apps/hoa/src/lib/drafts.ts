'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Database, Json } from '@homeownerhub/db/types'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

type DraftKind = 'violation' | 'meeting' | 'eviction_case'
type DraftUpdate = Database['public']['Tables']['wizard_drafts']['Update']

export interface WizardDraft {
  id: string
  kind: DraftKind
  payload: Record<string, unknown>
  current_step: string
  step_index: number
  total_steps: number
  completed: boolean
  created_at: string
  updated_at: string
}

const SaveSchema = z.object({
  draftId: z.string().uuid().optional(),
  kind: z.enum(['violation', 'meeting', 'eviction_case']),
  payload: z.record(z.string(), z.unknown()),
  currentStep: z.string().min(1),
  stepIndex: z.number().int().min(0),
  totalSteps: z.number().int().min(1),
})

export type DraftActionResult =
  | { ok: true; draftId: string }
  | { ok: false; error: string }

/**
 * Upsert a draft. Pass draftId on subsequent saves to update the same row;
 * omit it for the first save and we'll create one. Returns the row id so
 * the wizard can stash it in client state and keep saving against it.
 */
export async function saveDraft(input: {
  draftId?: string
  kind: DraftKind
  payload: Record<string, unknown>
  currentStep: string
  stepIndex: number
  totalSteps: number
}): Promise<DraftActionResult> {
  const parsed = SaveSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No org selected.' }

  const now = new Date().toISOString()
  const baseFields: DraftUpdate = {
    payload: parsed.data.payload as Json,
    current_step: parsed.data.currentStep,
    step_index: parsed.data.stepIndex,
    total_steps: parsed.data.totalSteps,
    updated_at: now,
  }

  if (parsed.data.draftId) {
    const { error } = await supabase
      .from('wizard_drafts')
      .update(baseFields)
      .eq('id', parsed.data.draftId)
    if (error) return { ok: false, error: error.message ?? 'save_failed' }
    return { ok: true, draftId: parsed.data.draftId }
  }

  const { data, error } = await supabase
    .from('wizard_drafts')
    .insert({
      org_id: org.id,
      user_id: user.id,
      kind: parsed.data.kind,
      ...baseFields,
    })
    .select('id')
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'insert_failed' }
  }
  return { ok: true, draftId: data.id }
}

export async function markDraftCompleted(draftId: string): Promise<void> {
  const supabase = await getSupabaseServerClient()
  await supabase
    .from('wizard_drafts')
    .update({ completed: true, updated_at: new Date().toISOString() })
    .eq('id', draftId)
  revalidatePath('/')
}

export async function discardDraft(draftId: string): Promise<void> {
  const supabase = await getSupabaseServerClient()
  await supabase.from('wizard_drafts').delete().eq('id', draftId)
  revalidatePath('/')
}

export async function listUnfinishedDrafts(): Promise<WizardDraft[]> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('wizard_drafts')
    .select(
      'id, kind, payload, current_step, step_index, total_steps, completed, created_at, updated_at',
    )
    .eq('completed', false)
    .order('updated_at', { ascending: false })
    .limit(10)
  return ((data ?? []) as unknown) as WizardDraft[]
}

export async function loadDraft(draftId: string): Promise<WizardDraft | null> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('wizard_drafts')
    .select(
      'id, kind, payload, current_step, step_index, total_steps, completed, created_at, updated_at',
    )
    .eq('id', draftId)
    .maybeSingle()
  return data ? ((data as unknown) as WizardDraft) : null
}
