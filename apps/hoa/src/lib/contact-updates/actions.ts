'use server'

import { revalidatePath } from 'next/cache'
import { inngest } from '@homeowner-portal/jobs'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { IMPERSONATION_READONLY_MSG } from '@/lib/impersonation'
import { loadMyContacts } from './resident-load'
import {
  CONTACT_CATEGORY,
  CONTACT_SUBJECT,
  changedFields,
  checkContactForm,
  formatContactRequest,
  type ContactField,
} from './model'

export type RequestContactResult =
  | { ok: true; ticketId: string }
  | { ok: false; error: string; fieldErrors?: Partial<Record<ContactField, string>> }

export interface RequestContactInput {
  unitId: string
  phone: string
  email: string
  mailing: string
}

/**
 * PR-10: send the board a change to MY contact details for one home. It
 * is written as a ticket with the resident's own client (the only write
 * RLS gives a resident here — see lib/contact-updates/model.ts), and
 * lands in /approvals → Contact updates. Nothing on file changes until a
 * board member approves it.
 *
 * Never logs the values.
 */
export async function requestContactUpdate(input: RequestContactInput): Promise<RequestContactResult> {
  const loaded = await loadMyContacts()
  if (!loaded.ok) return { ok: false, error: 'Couldn’t load your details. Try again.' }
  const { actor, units, homes } = loaded.data
  if (actor.impersonating) return { ok: false, error: IMPERSONATION_READONLY_MSG }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return { ok: false, error: 'Not signed in.' }
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  const home = homes.find((h) => h.unitId === input.unitId)
  const unit = units.find((u) => u.unit_id === input.unitId)
  if (!home || !unit || home.editable.length === 0) {
    return { ok: false, error: 'You can only update the details on file for your own home.' }
  }
  if (home.pending) {
    return { ok: false, error: 'You already have a change waiting for the board. Reply on that request to add to it.' }
  }

  const checked = checkContactForm(input, { requireEmail: home.editable.includes('email') && home.current.email !== null })
  if (!checked.ok) {
    const first = Object.values(checked.fieldErrors)[0] ?? 'Check the highlighted fields.'
    return { ok: false, error: first, fieldErrors: checked.fieldErrors }
  }
  const changes = changedFields(home.current, checked.values, home.editable)
  if (changes.length === 0) return { ok: false, error: 'Nothing has changed yet. Edit a field, then send it.' }

  const { data: row, error } = await supabase
    .from('tickets' as never)
    .insert({
      organization_id: org.id,
      association_id: unit.association_id,
      unit_id: unit.unit_id,
      submitted_by: user.id,
      category: CONTACT_CATEGORY,
      subject: CONTACT_SUBJECT,
      description: formatContactRequest(changes, user.email),
      status: 'open',
    } as never)
    .select('id')
    .single<{ id: string }>()
  if (error || !row) {
    console.error('[contact-updates.request] insert failed', { orgId: org.id, unitId: unit.unit_id, code: (error as { code?: string } | null)?.code ?? null })
    return { ok: false, error: 'Couldn’t send your change. Try again.' }
  }

  // Tell the board, as for any request. Swallowed: the request is saved.
  try {
    await inngest.send({ name: 'ticket/created', data: { ticketId: row.id, organizationId: org.id } })
  } catch {
    console.error('[contact-updates.request] board notification not queued', { ticketId: row.id })
  }

  revalidatePath('/resident/account')
  revalidatePath('/resident/tickets')
  return { ok: true, ticketId: row.id }
}
