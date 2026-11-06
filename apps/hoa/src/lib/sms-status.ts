/**
 * BL-146: Twilio delivery receipts (StatusCallback) → the SMS row's
 * delivery state.
 *
 * Twilio posts a status for each text to /api/webhooks/twilio/status
 * (behind SMS_STATUS_WEBHOOK_ENABLED). The route verifies X-Twilio-
 * Signature exactly as the inbound route does (verifyTwilioSignature in
 * ./sms-inbound), then calls applySmsStatus here.
 *
 * The row is found by the provider's message id (the Twilio MessageSid) only
 * (communication_recipients.external_id, channel 'sms'): never by number,
 * name or text, and nothing about the resident is read.
 *
 *   sent                              → 'sent'      (+ sent_at)
 *   delivered                         → 'delivered' (+ delivered_at)
 *   undelivered / failed              → 'failed'    (+ failed_at, a fixed error_message)
 *   anything else (queued, accepted,
 *   sending, read …)                  → nothing
 *
 * Idempotent and forward-only (RC-6): each timestamp is first-write-wins
 * (`… is null`), and the status only moves from an earlier one, so a
 * retried or late receipt is a no-op and a 'delivered' row never turns
 * 'failed' (nor 'replied' / 'suppressed' anything). Logs nothing; the
 * route logs the message id, the status and a count.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { checkWrite } from '@/lib/api/db'

type Db = SupabaseClient<Database>
type RecipientUpdate = Database['public']['Tables']['communication_recipients']['Update']
type DeliveryStatus = NonNullable<RecipientUpdate['delivery_status']>
type TimestampField = 'sent_at' | 'delivered_at' | 'failed_at'

export interface SmsStatusMove {
  status: DeliveryStatus
  timestamp: TimestampField
  /** The statuses this one may overwrite (forward only). */
  from: DeliveryStatus[]
}

const FAILED: SmsStatusMove = { status: 'failed', timestamp: 'failed_at', from: ['queued', 'sent'] }

const MOVES: Record<string, SmsStatusMove> = {
  sent: { status: 'sent', timestamp: 'sent_at', from: ['queued'] },
  delivered: { status: 'delivered', timestamp: 'delivered_at', from: ['queued', 'sent'] },
  undelivered: FAILED,
  failed: FAILED,
}

/** What a Twilio MessageStatus does to the row, or null when it changes nothing. */
export function smsStatusMove(status: string | null | undefined): SmsStatusMove | null {
  if (!status) return null
  return MOVES[status.trim().toLowerCase()] ?? null
}

/**
 * The board-facing reason on a failed text. Fixed wording; Twilio's ErrorCode
 * is added only when it is a short code (digits or a short word), so no
 * provider free text lands in the row.
 */
export function smsFailureMessage(status: string, code: string | null | undefined): string {
  const safe = code && /^[A-Za-z0-9_.-]{1,20}$/.test(code.trim()) ? code.trim() : null
  const what = 'The carrier did not deliver this text'
  return safe ? `${what} (code ${safe}).` : `${what}.`
}

export interface SmsStatusOutcome {
  /** Rows whose status moved because of this receipt. */
  updated: number
}

/**
 * Apply one receipt. Every write is checked (a failure throws, so the
 * route answers 500 and Twilio retries).
 */
export async function applySmsStatus(
  db: Db,
  args: { messageId: string; status: string; at: string; errorCode?: string | null },
): Promise<SmsStatusOutcome> {
  const move = smsStatusMove(args.status)
  if (!move) return { updated: 0 }
  const ctx = { messageId: args.messageId }

  // The status first, forward only. A failure carries its reason with it.
  const statusUpdate: RecipientUpdate = { delivery_status: move.status }
  if (move.status === 'failed') statusUpdate.error_message = smsFailureMessage(args.status, args.errorCode)
  const { data, error } = await db
    .from('communication_recipients')
    .update(statusUpdate)
    .eq('external_id', args.messageId)
    .eq('channel', 'sms')
    .in('delivery_status', move.from)
    .select('id')
  checkWrite({ error }, 'webhooks.twilio_status.status', ctx)
  const moved = ((data ?? []) as Array<{ id: string }>).map((r) => r.id)
  if (moved.length === 0) return { updated: 0 }

  // The event's time, first-write-wins, only on the rows that just moved: a
  // late `failed` on a delivered row must not stamp failed_at.
  const tsUpdate: RecipientUpdate = { [move.timestamp]: args.at }
  const { error: tsError } = await db
    .from('communication_recipients')
    .update(tsUpdate)
    .in('id', moved)
    .is(move.timestamp, null)
  checkWrite({ error: tsError }, 'webhooks.twilio_status.timestamp', ctx)
  return { updated: moved.length }
}
