/**
 * BL-146: Vonage delivery receipts (Messages API status webhooks) → the
 * SMS row's delivery state.
 *
 * Vonage posts a status for each text to /api/webhooks/vonage/status
 * (behind SMS_STATUS_WEBHOOK_ENABLED). The route verifies the signed-
 * webhook JWT exactly as the inbound route does (verifyVonageSignedWebhook
 * in ./sms-inbound: HS256 with the signature secret, plus payload_hash =
 * SHA-256 of the exact body), then calls applySmsStatus here.
 *
 * The row is found by the provider's message id only
 * (communication_recipients.external_id, channel 'sms'): never by number,
 * name or text, and nothing about the resident is read.
 *
 *   submitted                         → 'sent'      (+ sent_at)
 *   delivered                         → 'delivered' (+ delivered_at)
 *   rejected / undeliverable / failed → 'failed'    (+ failed_at, a fixed error_message)
 *   anything else (read, accepted …)  → nothing
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
  submitted: { status: 'sent', timestamp: 'sent_at', from: ['queued'] },
  delivered: { status: 'delivered', timestamp: 'delivered_at', from: ['queued', 'sent'] },
  rejected: FAILED,
  undeliverable: FAILED,
  failed: FAILED,
}

/** What a Vonage status does to the row, or null when it changes nothing. */
export function smsStatusMove(status: string | null | undefined): SmsStatusMove | null {
  if (!status) return null
  return MOVES[status.trim().toLowerCase()] ?? null
}

/**
 * The board-facing reason on a failed text. Fixed wording; Vonage's code
 * is added only when it is a short code (digits or a short word), so no
 * provider free text lands in the row.
 */
export function smsFailureMessage(status: string, code: string | null | undefined): string {
  const safe = code && /^[A-Za-z0-9_.-]{1,20}$/.test(code.trim()) ? code.trim() : null
  const what = status.trim().toLowerCase() === 'rejected' ? 'Vonage rejected this text' : 'The carrier did not deliver this text'
  return safe ? `${what} (code ${safe}).` : `${what}.`
}

export interface SmsStatusOutcome {
  /** Rows whose status moved because of this receipt. */
  updated: number
}

/**
 * Apply one receipt. Every write is checked (a failure throws, so the
 * route answers 500 and Vonage retries).
 */
export async function applySmsStatus(
  db: Db,
  args: { messageId: string; status: string; at: string; errorCode?: string | null },
): Promise<SmsStatusOutcome> {
  const move = smsStatusMove(args.status)
  if (!move) return { updated: 0 }
  const ctx = { messageId: args.messageId }

  // The event's time, first-write-wins, whether or not the status moves.
  const tsUpdate: RecipientUpdate = { [move.timestamp]: args.at }
  const { error: tsError } = await db
    .from('communication_recipients')
    .update(tsUpdate)
    .eq('external_id', args.messageId)
    .eq('channel', 'sms')
    .is(move.timestamp, null)
  checkWrite({ error: tsError }, 'webhooks.vonage_status.timestamp', ctx)

  // The status, forward only. A failure carries its reason with it.
  const statusUpdate: RecipientUpdate = { delivery_status: move.status }
  if (move.status === 'failed') statusUpdate.error_message = smsFailureMessage(args.status, args.errorCode)
  const { data, error } = await db
    .from('communication_recipients')
    .update(statusUpdate)
    .eq('external_id', args.messageId)
    .eq('channel', 'sms')
    .in('delivery_status', move.from)
    .select('id')
  checkWrite({ error }, 'webhooks.vonage_status.status', ctx)
  return { updated: ((data ?? []) as unknown[]).length }
}
