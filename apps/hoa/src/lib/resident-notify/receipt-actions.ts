'use server'

// BL-114 — payment receipts, board side:
//   * Settings → Resident payments → "Email owners a receipt when we record
//     their payment": the association-wide switch, OFF until a board saves
//     it ON (storage and signing: ./receipt-settings.ts).
//   * Dues → "Send receipt": the board's explicit, per-payment send, which
//     works whatever the switch says.
//
// Board/admin only: every action re-checks the role
// (requireBoardOrAdminForAction) because a server action is a public
// endpoint.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getCurrentOrg } from '@/lib/orgs'
import { loadOrFail } from '@/lib/load-or-fail'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { readPaymentReceiptSettings, signPaymentReceiptSettings, withPaymentReceiptSettings } from './receipt-settings'
import { sendPaymentReceiptNow } from './receipt-notify'
import type { PaymentReceiptStatus } from './receipt-run'

export interface BoardPaymentReceiptSettings {
  association: { id: string; name: string }
  state: 'configured' | 'not_configured' | 'unverified'
  /** What the automatic send acts on: a verified, saved ON. */
  on: boolean
  emailConfigured: boolean
}

export type BoardPaymentReceiptLoad =
  | { ok: true; data: BoardPaymentReceiptSettings }
  | { ok: false; reason: 'forbidden' | 'no_association' | 'failed' }

type AssocRow = { id: string; name: string; compliance_settings: unknown }

function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

/** The org's primary association (first by name — getPrimaryAssociation's rule). */
async function loadPrimaryAssociation(): Promise<{ ok: true; row: AssocRow | null } | { ok: false }> {
  const org = await getCurrentOrg()
  if (!org) return { ok: true, row: null }
  const supabase = await getSupabaseServerClient()
  const res = await loadOrFail(
    'payment receipt settings association',
    supabase
      .from('associations')
      .select('id, name, compliance_settings')
      .eq('organization_id', org.id)
      .order('name', { ascending: true })
      .limit(1),
  )
  if (!res.ok) return { ok: false }
  return { ok: true, row: ((res.data ?? []) as AssocRow[])[0] ?? null }
}

export async function getBoardPaymentReceiptSettings(): Promise<BoardPaymentReceiptLoad> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, reason: 'forbidden' }
  const assoc = await loadPrimaryAssociation()
  if (!assoc.ok) return { ok: false, reason: 'failed' }
  if (!assoc.row) return { ok: false, reason: 'no_association' }
  const { row } = assoc

  const read = readPaymentReceiptSettings(row.id, row.compliance_settings, paySettingsSecret())
  return {
    ok: true,
    data: {
      association: { id: row.id, name: row.name },
      state: read.state,
      on: read.state === 'configured' && read.settings.emailOnRecord,
      emailConfigured: emailConfigured(),
    },
  }
}

export type SavePaymentReceiptResult = { ok: true } | { ok: false; error: string }

export async function savePaymentReceiptSettings(input: { on: boolean }): Promise<SavePaymentReceiptResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (typeof input?.on !== 'boolean') return { ok: false, error: 'Invalid input.' }

  const secret = paySettingsSecret()
  if (!secret) return { ok: false, error: 'This setting can’t be saved on this server yet. Contact support.' }

  const assoc = await loadPrimaryAssociation()
  if (!assoc.ok) return { ok: false, error: 'Couldn’t load your association. Try again.' }
  if (!assoc.row) return { ok: false, error: 'No association is set up for this organization yet.' }
  const row = assoc.row

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const stored = signPaymentReceiptSettings(
    row.id,
    { emailOnRecord: input.on },
    { updatedAt: new Date().toISOString(), updatedBy: user?.id ?? null },
    secret,
  )
  const { data, error } = await supabase
    .from('associations')
    .update({ compliance_settings: withPaymentReceiptSettings(row.compliance_settings, stored) as never })
    .eq('id', row.id)
    .select('id')
  if (error || !data || data.length === 0) {
    // Code only: a Postgres message can embed row values (RC-2).
    console.error('[payment-receipt-settings] save failed', { code: error?.code ?? 'no_rows', associationId: row.id })
    return { ok: false, error: 'Couldn’t save the setting. Try again.' }
  }

  revalidatePath('/settings/payments')
  return { ok: true }
}

const SendSchema = z.object({ paymentId: z.string().uuid() })

export type SendPaymentReceiptResult =
  | { ok: true; status: Extract<PaymentReceiptStatus, 'sent' | 'held'>; sent: number; held: number; optedOut: number }
  | { ok: false; status: PaymentReceiptStatus | 'invalid' | 'forbidden'; error: string }

const SEND_ERRORS: Record<Exclude<PaymentReceiptStatus, 'sent' | 'held'>, string> = {
  off: 'Receipts are off.',
  already_sent: 'A receipt for this payment was already sent from this button.',
  failed: 'Couldn’t send the receipt. Try again.',
  opted_out: 'The owners of this property turned off emails, so no receipt was sent.',
  no_contact: 'No owner of this property has an email address on file.',
  not_found: 'That payment wasn’t found.',
  email_not_configured: 'Email isn’t set up on this server, so no receipt was sent.',
}

/**
 * The board's explicit "Send receipt" on a recorded payment. Works whether
 * or not the automatic setting is on — the click is the opt-in. Still
 * honours each owner's email preference, the outbound guard and the org
 * sandbox flag. Once per payment from this button (the automatic receipt
 * is counted separately).
 */
export async function sendPaymentReceipt(input: { paymentId: string }): Promise<SendPaymentReceiptResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, status: 'forbidden', error: gate.error }
  const parsed = SendSchema.safeParse(input)
  if (!parsed.success) return { ok: false, status: 'invalid', error: 'Invalid input.' }

  const assoc = await loadPrimaryAssociation()
  if (!assoc.ok) return { ok: false, status: 'failed', error: 'Couldn’t load your association. Try again.' }
  if (!assoc.row) return { ok: false, status: 'not_found', error: 'No association is set up for this organization yet.' }

  const supabase = await getSupabaseServerClient()
  const r = await sendPaymentReceiptNow(supabase, { paymentId: parsed.data.paymentId, associationId: assoc.row.id })
  if (r.status === 'sent' || r.status === 'held') {
    revalidatePath('/communications')
    return { ok: true, status: r.status, sent: r.sent, held: r.held, optedOut: r.optedOut }
  }
  return { ok: false, status: r.status, error: SEND_ERRORS[r.status] }
}
