'use server'

/**
 * Correcting a resident's contact details from the thread that proves they
 * are wrong.
 *
 * The alias repoint is the point of this action, not a nicety.
 * `inbox_sender_aliases` maps a literal sender address to a unit and is
 * matched at HIGHER precedence than the resident-email rule (match.ts:145
 * before :157, both 'high'). Correcting the email without repointing it
 * would look successful and change nothing about where that resident's mail
 * files — nothing else in the repo ever invalidates an alias.
 *
 * Two different property ids are in play. `inbox_threads.unit_id` is a
 * `units.id` and keys the /properties/[id] route;
 * `property_residents.property_id` is `units.legacy_hoa_property_id`, an
 * `hoa_properties.id`. The ownership check uses the legacy id; the
 * revalidation uses the unit id.
 *
 * Never log an email address, subject, or body — resident PII.
 * `PostgrestError.code`/`.message` only, never `.details`.
 */

import { revalidatePath } from 'next/cache'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { logPropertyEvent } from '@/lib/property-events'

export interface UpdateResidentFromInboxFields {
  fullName: string
  email: string | null
  phone: string | null
}

export async function updateResidentFromInbox(
  threadId: string,
  residentId: string,
  fields: UpdateResidentFromInboxFields,
): Promise<{ ok: true; warning?: string } | { error: string }> {
  const { org } = await requireBoardOrAdmin()

  const fullName = fields.fullName.trim()
  if (!fullName) return { error: 'Name is required.' }
  const email = fields.email?.trim().toLowerCase() || null
  const phone = fields.phone?.trim() || null

  const supabase = await getSupabaseServerClient()

  // 1. Thread -> unit, org-scoped.
  const { data: thread, error: threadError } = await supabase
    .from('inbox_threads')
    .select('unit_id')
    .eq('id', threadId)
    .eq('organization_id', org.id)
    .maybeSingle<{ unit_id: string | null }>()

  if (threadError) {
    console.error(
      `updateResidentFromInbox: thread read failed: ${threadError.code} ${threadError.message}`,
    )
    return { error: 'Could not update this resident. Try again.' }
  }
  if (!thread?.unit_id) return { error: 'This thread is not filed under a property.' }

  // 2. Unit -> legacy hoa_properties id, which is what residents hang off.
  const { data: unit, error: unitError } = await supabase
    .from('units')
    .select('legacy_hoa_property_id')
    .eq('id', thread.unit_id)
    .eq('organization_id', org.id)
    .maybeSingle<{ legacy_hoa_property_id: string | null }>()

  if (unitError) {
    console.error(
      `updateResidentFromInbox: unit read failed: ${unitError.code} ${unitError.message}`,
    )
    return { error: 'Could not update this resident. Try again.' }
  }
  if (!unit?.legacy_hoa_property_id) return { error: 'This property has no resident records.' }

  // 3. The resident must belong to this org AND to this thread's property. A
  //    residentId arriving from a form is untrustworthy on both counts —
  //    the same hazard linkThreadToResource had to be patched for.
  const { data: resident, error: residentError } = await supabase
    .from('property_residents' as never)
    .select('id, property_id, email')
    .eq('id', residentId)
    .eq('organization_id', org.id)
    .maybeSingle<{ id: string; property_id: string; email: string | null }>()

  if (residentError) {
    console.error(
      `updateResidentFromInbox: resident read failed: ${residentError.code} ${residentError.message}`,
    )
    return { error: 'Could not update this resident. Try again.' }
  }
  if (!resident || resident.property_id !== unit.legacy_hoa_property_id) {
    // One message for both "absent" and "belongs to someone else" — telling
    // them apart would leak the existence of another tenant's row.
    return { error: 'Resident not found.' }
  }

  const previousEmail = resident.email?.trim().toLowerCase() || null
  const emailChanged = previousEmail !== email

  // 4. The write.
  const { error: updateError } = await supabase
    .from('property_residents' as never)
    .update({ full_name: fullName, email, phone } as never)
    .eq('id', residentId)
    .eq('organization_id', org.id)

  if (updateError) {
    console.error(
      `updateResidentFromInbox: update failed: ${updateError.code} ${updateError.message}`,
    )
    return { error: 'Could not update this resident. Try again.' }
  }

  let warning: string | undefined

  // 5. Repoint the alias — ONLY on a real email change. A name or phone
  //    edit must not disturb a mapping a manager taught deliberately.
  if (emailChanged) {
    const aliasError = await repointAlias(supabase, {
      orgId: org.id,
      unitId: thread.unit_id,
      residentId,
      previousEmail,
      email,
    })
    if (aliasError) {
      // The resident record is already corrected, which is the user's
      // primary intent. Rolling that back because a secondary index write
      // failed would be the worse trade — report it instead.
      warning =
        'The resident was updated, but their old address may still route mail to this property. Check Settings → Mailbox.'
    }

    // 6. Audit. Best-effort: a failed history row must not fail the edit.
    const event = await logPropertyEvent({
      propertyId: unit.legacy_hoa_property_id,
      kind: 'note',
      payload: {
        field: 'email',
        from: previousEmail,
        to: email,
        alias_repointed: !aliasError,
      },
      notes: 'Resident email updated from the inbox',
    })
    if (!event.ok) {
      console.error(`updateResidentFromInbox: audit log failed: ${event.error}`)
    }
  }

  revalidatePath(`/inbox/${threadId}`)
  // The /properties route is keyed by UNIT id, not the legacy property id.
  revalidatePath(`/properties/${thread.unit_id}`)

  return warning ? { ok: true, warning } : { ok: true }
}

/**
 * Drop the alias for the address the resident no longer uses, and point one
 * at the new address.
 *
 * Deleting alone would be enough for correctness — the resident-email rule
 * would then match the new address — but the upsert preserves
 * high-confidence filing from the very first message at the new address.
 *
 * `assignThreadToProperty` never populates `resident_id` (always NULL
 * today), so this is the first writer to set it. The column is read at
 * match.ts:365 and flows into `outcome.residentId`.
 *
 * Returns an error string to report, or null on success. Never throws.
 */
async function repointAlias(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  args: {
    orgId: string
    unitId: string
    residentId: string
    previousEmail: string | null
    email: string | null
  },
): Promise<string | null> {
  const { orgId, unitId, residentId, previousEmail, email } = args

  if (previousEmail) {
    const { error } = await supabase
      .from('inbox_sender_aliases')
      .delete()
      .eq('organization_id', orgId)
      .eq('email_address', previousEmail)
    if (error) {
      console.error(`repointAlias: delete failed: ${error.code} ${error.message}`)
      return error.message
    }
  }

  if (!email) return null

  // Unique index is (organization_id, lower(email_address)) — migration
  // 0033. The caller lowercases the address before this point, so the
  // conflict target matches.
  const { error } = await supabase.from('inbox_sender_aliases').upsert(
    {
      organization_id: orgId,
      email_address: email,
      unit_id: unitId,
      resident_id: residentId,
      source: 'manual',
    } as never,
    { onConflict: 'organization_id,email_address_lower' },
  )

  if (error) {
    console.error(`repointAlias: upsert failed: ${error.code} ${error.message}`)
    return error.message
  }
  return null
}
