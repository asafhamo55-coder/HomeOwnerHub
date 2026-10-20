'use server'

/**
 * BL-102 A9: save, load and delete composer drafts (see drafts.ts).
 *
 * Every write is limited to rows that are still `status = 'draft'` and not
 * deleted, so a draft that was sent (and then removed by the composer) or
 * deleted in another tab is never revived or changed by a late autosave,
 * and these actions can never touch a sent or scheduled message.
 *
 * Nothing here sends anything or logs the draft's content.
 */

import { revalidatePath } from 'next/cache'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'
import {
  MAX_DRAFT_BYTES,
  draftRowFields,
  draftStateFromRow,
  isDraftEmpty,
  isUuid,
  parseDraftState,
  type ComposerDraftState,
} from './drafts'

export type SaveDraftResult =
  | { ok: true; id: string }
  /** `gone`: the draft was sent or deleted elsewhere; stop autosaving it. */
  | { ok: false; error: string; gone?: true }

export async function saveDraft(input: { id: string | null; state: unknown }): Promise<SaveDraftResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  let size = 0
  try {
    size = JSON.stringify(input.state ?? null).length
  } catch {
    return { ok: false, error: 'The draft couldn’t be read.' }
  }
  if (size > MAX_DRAFT_BYTES) return { ok: false, error: 'This draft is too large to save.' }
  const state = parseDraftState(input.state)
  if (!state) return { ok: false, error: 'The draft couldn’t be read.' }
  if (input.id !== null && !isUuid(input.id)) return { ok: false, error: 'Draft not found.', gone: true }

  const fields = draftRowFields(state)
  const supabase = await getSupabaseServerClient()

  if (input.id) {
    const { data, error } = await supabase
      .from('communications')
      .update({ ...fields, audience_definition: fields.audience_definition as never })
      .eq('id', input.id)
      .eq('association_id', assoc.id)
      .eq('status', 'draft')
      .is('deleted_at', null)
      .select('id')
    if (error) return { ok: false, error: 'The draft couldn’t be saved. Try again.' }
    if (!data || data.length === 0) {
      return { ok: false, error: 'This draft was sent or deleted, so changes here aren’t saved.', gone: true }
    }
    return { ok: true, id: input.id }
  }

  // A new draft only once there is something to keep.
  if (isDraftEmpty(state)) return { ok: false, error: 'Nothing to save yet.' }

  const { data: assocRow } = await supabase
    .from('associations')
    .select('organization_id')
    .eq('id', assoc.id)
    .single()
  const organizationId = (assocRow as { organization_id: string } | null)?.organization_id
  if (!organizationId) return { ok: false, error: 'The draft couldn’t be saved. Try again.' }

  const { data: inserted, error } = await supabase
    .from('communications')
    .insert({
      ...fields,
      audience_definition: fields.audience_definition as never,
      organization_id: organizationId,
      association_id: assoc.id,
      status: 'draft',
      source: 'manual',
    })
    .select('id')
    .single()
  if (error || !inserted) return { ok: false, error: 'The draft couldn’t be saved. Try again.' }
  revalidatePath('/communications')
  return { ok: true, id: (inserted as { id: string }).id }
}

/** Soft-deletes a draft. Never touches a message that isn't a draft. */
export async function deleteDraft(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }
  if (!isUuid(id)) return { ok: false, error: 'Draft not found.' }

  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('communications')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', id)
    .eq('association_id', assoc.id)
    .eq('status', 'draft')
    .is('deleted_at', null)
    .select('id')
  if (error) return { ok: false, error: 'The draft couldn’t be deleted. Try again.' }
  if (!data || data.length === 0) return { ok: false, error: 'Draft not found. It may already be sent or deleted.' }
  revalidatePath('/communications')
  return { ok: true }
}

/** The stored composer state for `/communications/new?draft=<id>`, or null. */
export async function loadDraft(id: string): Promise<{ id: string; state: ComposerDraftState } | null> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return null
  const assoc = await getPrimaryAssociation()
  if (!assoc || !isUuid(id)) return null

  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('communications')
    .select('id, audience_definition')
    .eq('id', id)
    .eq('association_id', assoc.id)
    .eq('status', 'draft')
    .is('deleted_at', null)
    .maybeSingle()
  if (!data) return null
  const state = draftStateFromRow((data as { audience_definition: unknown }).audience_definition)
  return state ? { id, state } : null
}
