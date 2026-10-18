'use server'

import { getCurrentOrg } from '@/lib/orgs'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { checkNote } from '@/lib/properties/note'
import { propertyHref } from '@/lib/properties/href'
import { asPropertyId } from '@/lib/properties/resolve'

// property_events lands in migration 0017. One row per meaningful change
// to a property — tenure flip, resident add/remove, lease start/end,
// waiting-list activity. The events table is append-only by convention
// (no UI for editing rows), so it doubles as the audit trail.

export type PropertyEventKind =
  | 'tenure_changed'
  | 'ownership_changed'
  | 'resident_added'
  | 'resident_removed'
  | 'lease_started'
  | 'lease_ended'
  | 'waiting_list_added'
  | 'waiting_list_resolved'
  | 'note'

export interface PropertyEventRow {
  id: string
  property_id: string
  occurred_at: string
  kind: PropertyEventKind
  payload: Record<string, unknown>
  notes: string | null
  created_by: string | null
}

export async function listPropertyEvents(
  propertyId: string,
  limit: number = 25,
): Promise<PropertyEventRow[]> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('property_events' as never)
    .select('id, property_id, occurred_at, kind, payload, notes, created_by')
    .eq('property_id', propertyId)
    .order('occurred_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as unknown as PropertyEventRow[]
}

// Internal helper — every mutating lib function that touches a property
// should drop one of these. organization_id is resolved from the current
// org rather than from the property row to keep the call sites cheap; if
// the property belongs to a different org RLS will reject the insert
// anyway.
export async function logPropertyEvent(args: {
  propertyId: string
  kind: PropertyEventKind
  payload?: Record<string, unknown>
  notes?: string | null
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('property_events' as never)
    .insert({
      organization_id: org.id,
      property_id: args.propertyId,
      kind: args.kind,
      payload: args.payload ?? {},
      notes: args.notes ?? null,
      created_by: user?.id ?? null,
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Could not log event.' }
  }
  return { ok: true, id: data.id }
}

/**
 * "Log note" on the property page: a dated note in the home's history.
 * Board/admin only (logPropertyEvent gates, before any read or write).
 * The note text is never logged; a failure returns a generic message.
 */
export async function logPropertyNote(
  propertyId: string,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const checked = checkNote(note)
  if (!checked.ok) return { ok: false, error: checked.error }
  const res = await logPropertyEvent({ propertyId, kind: 'note', notes: checked.note })
  if (!res.ok) {
    console.error('logPropertyNote: insert failed', { propertyId })
    return { ok: false, error: 'Couldn’t save the note. Try again.' }
  }
  revalidatePath(propertyHref(asPropertyId(propertyId)))
  return { ok: true }
}
