/**
 * Deliver one scheduled communication (BL-102 A1).
 *
 * Called by the `communications-scheduled-dispatch` Inngest job
 * (packages/jobs/src/communications-scheduled.ts) AFTER it has claimed the
 * row with an atomic `scheduled → sending` update. This function therefore
 * only acts on a row whose status is 'sending': anything else (cancelled,
 * already finished, deleted) is left alone.
 *
 * NOT a 'use server' file: it runs with the service-role client and must
 * never be callable from a browser. Only the Inngest route imports it.
 *
 * What it delivers is exactly what the board scheduled: the stored subject
 * and body (template answers were baked in at schedule time, see
 * ./partial-render.ts) to the queued recipient rows written then, through
 * the same guarded senders as send-now (./deliver.ts). Before sending, it
 * re-checks resident preferences, so a resident who opted out after the
 * message was scheduled is not sent to.
 *
 * Never throws: any failure marks the communication 'failed' and returns
 * an error, because the job runs at most once and a throw would only be
 * swallowed there. Logs nothing — the job logs ids and counts.
 */

import { createAdminClient } from '@homeowner-portal/db'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { deliverToRecipients, type QueuedRecipientRow } from './deliver'
import { applyPreferences, loadPreferenceMap, preferencesApply } from './preferences'

type Db = SupabaseClient<Database>

export type ScheduledDeliveryResult =
  | { ok: true; sentCount: number; failedCount: number; skippedCount: number; optedOutCount: number }
  | { ok: false; error: string }

interface StoredAudience {
  kind?: string
  official_notice?: boolean
}

export async function dispatchScheduledCommunication(
  communicationId: string,
  db: Db = createAdminClient(),
): Promise<ScheduledDeliveryResult> {
  try {
    return await dispatch(db, communicationId)
  } catch (err) {
    await markCommunication(db, communicationId, 'failed').catch(() => undefined)
    return { ok: false, error: err instanceof Error ? err.message : 'delivery failed' }
  }
}

async function dispatch(db: Db, communicationId: string): Promise<ScheduledDeliveryResult> {
  const { data: comm, error: commErr } = await db
    .from('communications')
    .select('id, organization_id, association_id, subject, body_html, body_text, channels, audience_definition, status')
    .eq('id', communicationId)
    .is('deleted_at', null)
    .maybeSingle()
  if (commErr) throw new Error(`communication lookup: ${commErr.message}`)
  if (!comm) return { ok: false, error: 'communication not found' }
  // Only a row this run claimed. 'scheduled' means nobody claimed it and
  // 'cancelled' / 'sent' / 'failed' mean it is no longer ours to send.
  if (comm.status !== 'sending') return { ok: false, error: `not claimed (status ${comm.status})` }

  const { data: assoc, error: assocErr } = await db
    .from('associations')
    .select('name, type')
    .eq('id', comm.association_id)
    .eq('organization_id', comm.organization_id)
    .maybeSingle()
  if (assocErr || !assoc) throw new Error('association lookup failed')

  const { data: rows, error: recErr } = await db
    .from('communication_recipients')
    .select('id, channel, email, phone, recipient_name, unit_id, user_id')
    .eq('communication_id', comm.id)
    .eq('organization_id', comm.organization_id)
    .eq('delivery_status', 'queued')
  if (recErr) throw new Error(`recipient lookup: ${recErr.message}`)
  const queued = (rows ?? []) as Array<QueuedRecipientRow & { user_id: string | null }>

  // Preferences may have changed since this was scheduled. Same policy as
  // the send (./preferences.ts); an official notice keeps its consent-
  // filtered email rows. A failed read sends nothing.
  const audience = (comm.audience_definition ?? {}) as StoredAudience
  let deliverable = queued
  let optedOutCount = 0
  if (preferencesApply(audience.kind ?? '', comm.channels)) {
    const prefs = await loadPreferenceMap(db, comm.organization_id)
    if (!prefs.ok) throw new Error('preferences read failed')
    const policy = { map: prefs.map, officialNoticeEmail: audience.official_notice === true }
    const suppressed: string[] = []
    deliverable = queued.filter((r) => {
      const { keep } = applyPreferences(r.user_id, [r.channel], policy)
      if (keep.length === 0) suppressed.push(r.id)
      return keep.length > 0
    })
    optedOutCount = suppressed.length
    if (suppressed.length > 0) {
      const { error } = await db
        .from('communication_recipients')
        .update({
          delivery_status: 'suppressed',
          error_message: 'Opted out after this message was scheduled',
          failed_at: new Date().toISOString(),
        })
        .in('id', suppressed)
        .eq('organization_id', comm.organization_id)
      if (error) throw new Error(`suppress opted-out rows: ${error.message}`)
    }
  }

  const counts =
    deliverable.length > 0
      ? await deliverToRecipients(db, {
          communicationId: comm.id,
          organizationId: comm.organization_id,
          associationName: assoc.name,
          associationType: assoc.type,
          subject: comm.subject,
          bodyHtml: comm.body_html,
          bodyText: comm.body_text,
          // Answers were baked into the stored subject and body when it was
          // scheduled; only the ambient per-recipient fields remain.
          extraFields: {},
          recipients: deliverable,
        })
      : { sentCount: 0, failedCount: 0, skippedCount: 0 }

  await markCommunication(db, comm.id, counts.sentCount > 0 ? 'sent' : 'failed')
  return { ok: true, ...counts, optedOutCount }
}

async function markCommunication(db: Db, id: string, status: 'sent' | 'failed'): Promise<void> {
  const { error } = await db
    .from('communications')
    .update({ status, sent_at: new Date().toISOString() })
    .eq('id', id)
    // Only the claimed row: never overwrite a status someone else set.
    .eq('status', 'sending')
  if (error) throw new Error(`finalize: ${error.message}`)
}
