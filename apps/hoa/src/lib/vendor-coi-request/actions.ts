'use server'

// "Request updated certificate" (BL-083): the board reviews a drafted email
// on the vendor page and sends it with an explicit click. The rules are in
// core.ts; this file wires the session client and the guarded sender.
//
// Board/admin only: both functions re-check the role because a server
// action is a public endpoint. The org comes from the gate, and every read
// is scoped to it.

import { revalidatePath } from 'next/cache'
import { fetchOrgSandbox } from '@homeowner-portal/observability/outbound-guard'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { ASSOCIATION_ZONE_COLUMNS, associationTimeZone, todayIn } from '@/lib/association-time'
import { sendEmail } from '@/lib/email'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  COI_REQUEST_RESOURCE_TYPE,
  CoiRequestInput,
  buildCoiRequestDraft,
  sendCoiRequestCore,
  type CoiDraftResult,
  type CoiRequestStore,
  type CoiSendResult,
} from './core'

type Sb = Awaited<ReturnType<typeof getSupabaseServerClient>>

class StoreError extends Error {
  constructor(what: string, code: string | undefined) {
    // Code only: a Postgres message can embed row values (RC-2).
    super(`vendor-coi-request: ${what} (${code ?? 'unknown'})`)
    this.name = 'StoreError'
  }
}

function sessionStore(supabase: Sb, orgId: string, userId: string | null): CoiRequestStore {
  // Generated types do not cover every table/column used here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as { from: (table: string) => any }
  return {
    async loadVendor(vendorId) {
      const { data, error } = await db
        .from('vendors')
        .select('id, legal_name, primary_email')
        .eq('id', vendorId)
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw new StoreError('vendor read', error.code)
      if (!data) return null
      const row = data as { id: string; legal_name: string; primary_email: string | null }
      return { id: row.id, legalName: row.legal_name, primaryEmail: row.primary_email }
    },
    async loadAssociation() {
      const { data, error } = await db
        .from('associations')
        .select(`id, name, compliance_settings, ${ASSOCIATION_ZONE_COLUMNS}`)
        .eq('organization_id', orgId)
        .order('name', { ascending: true })
        .limit(1)
      if (error) throw new StoreError('association read', error.code)
      const row = ((data ?? []) as Array<{ id: string; name: string; compliance_settings: unknown; state: string | null }>)[0]
      if (!row) return null
      return {
        id: row.id,
        name: row.name,
        complianceSettings: row.compliance_settings,
        today: todayIn(associationTimeZone(row)),
      }
    },
    async loadCoiExpiration(vendorId, associationId) {
      const { data, error } = await db
        .from('vendor_compliance')
        .select('coi_expiration_date')
        .eq('vendor_id', vendorId)
        .eq('association_id', associationId)
        .maybeSingle()
      if (error) throw new StoreError('compliance read', error.code)
      return ((data as { coi_expiration_date: string | null } | null)?.coi_expiration_date ?? null)?.slice(0, 10) ?? null
    },
    orgSandbox() {
      return fetchOrgSandbox(db, orgId)
    },
    async record(r) {
      const { data: comm, error } = await db
        .from('communications')
        .insert({
          organization_id: orgId,
          association_id: r.associationId,
          category: 'custom',
          subject: r.subject,
          body_html: r.html,
          body_text: r.text,
          channels: ['email'],
          audience_definition: { kind: 'vendor', vendor_id: r.vendorId, summary: 'Certificate request: 1 vendor' },
          audience_summary: 'Certificate request: 1 vendor',
          status: 'sending',
          source: 'manual',
          related_resource: { type: COI_REQUEST_RESOURCE_TYPE, id: r.vendorId },
          created_by: userId,
          sent_by: userId,
        })
        .select('id')
        .single()
      if (error || !comm) throw new StoreError('communication insert', error?.code)
      const communicationId = (comm as { id: string }).id
      const { data: rec, error: recError } = await db
        .from('communication_recipients')
        .insert({
          organization_id: orgId,
          communication_id: communicationId,
          recipient_name: r.vendorName,
          email: r.to,
          channel: 'email',
          delivery_status: 'queued',
        })
        .select('id')
        .single()
      if (recError || !rec) {
        // Compensate: no recipient row means nothing will be sent, so the
        // communication must not sit in 'sending' forever.
        const { error: undoError } = await db.from('communications').update({ status: 'failed' }).eq('id', communicationId)
        if (undoError) console.error('[vendor-coi-request] compensate failed', { communicationId, code: undoError.code })
        throw new StoreError('recipient insert', recError?.code)
      }
      return { communicationId, recipientId: (rec as { id: string }).id }
    },
    async markRecipient(id, outcome) {
      const at = new Date().toISOString()
      const patch =
        outcome.status === 'sent'
          ? { delivery_status: 'sent', external_id: outcome.externalId, sent_at: at }
          : { delivery_status: outcome.status, error_message: outcome.error, failed_at: at }
      const { error } = await db.from('communication_recipients').update(patch).eq('id', id)
      if (error) throw new StoreError('recipient update', error.code)
    },
    async finish(communicationId, status) {
      const { error } = await db
        .from('communications')
        .update({ status, sent_at: status === 'sent' ? new Date().toISOString() : null })
        .eq('id', communicationId)
      if (error) throw new StoreError('status update', error.code)
    },
  }
}

const log = { error: (msg: string, ctx: Record<string, unknown>) => console.error(msg, ctx) }

/** The draft the review dialog opens with. Board/admin only. */
export async function loadCoiRequestDraft(vendorId: string): Promise<CoiDraftResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, reason: 'not_found' }
  if (!CoiRequestInput.shape.vendorId.safeParse(vendorId).success) return { ok: false, reason: 'not_found' }
  const supabase = await getSupabaseServerClient()
  return buildCoiRequestDraft(sessionStore(supabase, gate.orgId, null), vendorId, log)
}

/** Sends the board-reviewed request to the vendor's address on file. Board/admin only. */
export async function sendCoiRequest(input: { vendorId: string; subject: string; body: string }): Promise<CoiSendResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = CoiRequestInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the message and try again.' }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const result = await sendCoiRequestCore(sessionStore(supabase, gate.orgId, user?.id ?? null), sendEmail, parsed.data, log)
  if (result.ok) {
    revalidatePath(`/vendors/${parsed.data.vendorId}`)
    revalidatePath('/communications')
  }
  return result
}
