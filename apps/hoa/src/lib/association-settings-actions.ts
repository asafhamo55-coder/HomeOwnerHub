'use server'

// BL-176: Settings -> Association. The one write: change an association's
// name, state, type and governing-law state.
//
// Board can READ the page; only an ADMIN can save. The RLS policy
// `associations_update` (0063) lets board members update, so the admin-only
// rule is enforced here, before any client exists. Every call:
//   1. re-checks the role (requireBoardOrAdminForAction, then admin);
//   2. validates the input with zod;
//   3. updates only a row of the caller's own organization;
//   4. writes an audit row with ids and codes only (old and new state and
//      type codes; never the association name or any address).
// The slug (the Zelle memo prefix, ADR-005) is NOT touched by a rename:
// changing it would break matching of memos already given to residents.

import { revalidatePath } from 'next/cache'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { updateAssociationSchema } from './association-settings'

export const ASSOCIATION_SETTINGS_AUDIT_ACTION = 'association.settings_updated'

export const ADMIN_ONLY_DENIED = 'Only an admin of your HOA can change the association’s state or type.'

export type UpdateAssociationResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Partial<Record<'name' | 'state' | 'type' | 'governingLawState', string>> }

export async function updateAssociationSettings(input: unknown): Promise<UpdateAssociationResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (gate.role !== 'admin') return { ok: false, error: ADMIN_ONLY_DENIED }

  const parsed = updateAssociationSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '')
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors }
  }
  const { associationId, name, state, type } = parsed.data
  const governing = parsed.data.governingLawState ?? state

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // The current values, for the audit row. Org-scoped: another org's id
  // finds nothing.
  const before = await supabase
    .from('associations')
    .select('id, state, governing_law_state, type')
    .eq('id', associationId)
    .eq('organization_id', gate.orgId)
    .maybeSingle()
  if (before.error) {
    console.error('[association-settings] read failed', { code: before.error.code ?? null, associationId })
    return { ok: false, error: 'Couldn’t load your association. Try again.' }
  }
  const old = before.data as { id: string; state: string | null; governing_law_state: string | null; type: string | null } | null
  if (!old) return { ok: false, error: 'We couldn’t find that association in your HOA.' }

  const { data, error } = await supabase
    .from('associations')
    .update({ name, state, governing_law_state: governing, type })
    .eq('id', associationId)
    .eq('organization_id', gate.orgId)
    .select('id')
  if (error || !data || data.length === 0) {
    // Code only: a Postgres message can embed row values.
    console.error('[association-settings] save failed', { code: error?.code ?? 'no_rows', associationId })
    return { ok: false, error: 'Couldn’t save the association. Try again.' }
  }

  const { error: auditErr } = await supabase.from('audit_log').insert({
    org_id: gate.orgId,
    user_id: user?.id ?? null,
    action: ASSOCIATION_SETTINGS_AUDIT_ACTION,
    entity_type: 'association',
    entity_id: associationId,
    metadata: {
      old_state: old.state,
      new_state: state,
      old_governing_law_state: old.governing_law_state,
      new_governing_law_state: governing,
      old_type: old.type,
      new_type: type,
    },
  })
  if (auditErr) console.error('[association-settings] audit failed', { associationId, code: auditErr.code ?? null })

  revalidatePath('/', 'layout')
  return { ok: true }
}
