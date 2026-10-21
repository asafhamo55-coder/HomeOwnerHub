/**
 * BL-114 — the Supabase side of the payment receipt runner (receipt-run.ts).
 *
 * Runs with the BOARD MEMBER's own RLS client, like store.ts (BL-082): the
 * board can read the payment, its assessment and association, the unit, the
 * unit's ownerships, the ledger and the owners' communication preferences
 * (0063), and writes communications rows like every other board send.
 * Reads and writes throw on error with the code only — a PostgrestError
 * message can echo row values.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchOrgSandbox } from '@homeowner-portal/observability/outbound-guard'
import { associationTimeZone } from '@/lib/association-time'
import { buildLedger, loadLedgerRows, paymentDay } from '@/lib/resident-ledger'
import { unitLabel } from '@/lib/dues-reminders/packets'
import { PAYMENT_RECEIPT_RESOURCE_TYPE, type PaymentReceiptStore, type ReceiptContext } from './receipt-run'
import { supabaseResidentNotifyStore } from './store'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

function fail(what: string, error: { code?: string } | null): Error {
  return new Error(`payment-receipt: ${what} failed (${error?.code ?? 'unknown'})`)
}

type PaymentRow = {
  id: string
  organization_id: string
  unit_id: string | null
  assessment_id: string | null
  amount: number | string
  paid_at: string
  payment_method: string | null
}

type AssocRow = {
  id: string
  name: string
  type: string | null
  organization_id: string
  compliance_settings: unknown
  state: string | null
}

export function supabasePaymentReceiptStore(db: Db): PaymentReceiptStore {
  const shared = supabaseResidentNotifyStore(db)
  return {
    async loadContext(paymentId: string): Promise<ReceiptContext | null> {
      const p = await db
        .from('payments')
        .select('id, organization_id, unit_id, assessment_id, amount, paid_at, payment_method')
        .eq('id', paymentId)
        .maybeSingle()
      if (p.error) throw fail('payment read', p.error)
      const payment = p.data as PaymentRow | null
      if (!payment || !payment.assessment_id) return null

      const a = await db
        .from('assessments')
        .select('id, association_id, unit_id')
        .eq('id', payment.assessment_id)
        .maybeSingle()
      if (a.error) throw fail('assessment read', a.error)
      const assessment = a.data as { id: string; association_id: string; unit_id: string } | null
      if (!assessment) return null
      const unitId = payment.unit_id ?? assessment.unit_id

      const assoc = await db
        .from('associations')
        .select('id, name, type, organization_id, compliance_settings, state')
        .eq('id', assessment.association_id)
        .maybeSingle()
      if (assoc.error) throw fail('association read', assoc.error)
      const row = assoc.data as AssocRow | null
      if (!row || row.organization_id !== payment.organization_id) return null

      const u = await db.from('units').select('id, address_line1, unit_number').eq('id', unitId).maybeSingle()
      if (u.error) throw fail('unit read', u.error)
      const unit = u.data as { address_line1: string | null; unit_number: string | null } | null

      const o = await db
        .from('ownerships')
        .select('owner_user_id, owner_name, owner_email')
        .eq('unit_id', unitId)
        .is('valid_to', null)
        .limit(50)
      if (o.error) throw fail('ownership read', o.error)
      const owners = ((o.data ?? []) as Array<{ owner_user_id: string | null; owner_name: string | null; owner_email: string | null }>).map(
        (r) => ({ userId: r.owner_user_id, name: r.owner_name, email: r.owner_email }),
      )

      // The property's balance after this payment, from the same ledger
      // the owner sees. A failed or capped read is "unknown" (null), never 0.
      const timeZone = associationTimeZone(row)
      const rows = await loadLedgerRows(db as unknown as SupabaseClient, [unitId], row.organization_id)
      const balance = rows.ok && !rows.truncated ? buildLedger(rows.assessments, rows.payments, timeZone).totals.balance : null

      return {
        association: {
          id: row.id,
          name: row.name,
          type: row.type,
          organizationId: row.organization_id,
          complianceSettings: row.compliance_settings,
        },
        payment: {
          id: payment.id,
          amount: Number(payment.amount),
          paidDay: paymentDay(payment.paid_at, timeZone),
          method: payment.payment_method,
          unitId,
        },
        propertyLabel: unit ? unitLabel(unit) : null,
        balance,
        owners,
      }
    },

    async emailOptIn(organizationId, userId) {
      const { data, error } = await db
        .from('resident_communication_preferences')
        .select('email_opt_in')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw fail('preferences read', error)
      // The table's own default (0018): email on.
      return (data as { email_opt_in: boolean } | null)?.email_opt_in !== false
    },

    orgSandbox(organizationId) {
      return fetchOrgSandbox(db, organizationId)
    },

    async claim(c) {
      const summary = `Payment receipt: ${c.recipientCount} ${c.recipientCount === 1 ? 'owner' : 'owners'}`
      const { error } = await db.from('communications').insert({
        id: c.id,
        organization_id: c.organizationId,
        association_id: c.associationId,
        category: 'dues',
        subject: c.subject,
        body_html: c.html,
        body_text: c.text,
        channels: ['email'],
        // Ids only: the addresses live on the recipient rows.
        audience_definition: { kind: 'unit_owners', unit_id: c.unitId, summary },
        audience_summary: summary,
        status: 'sending',
        source: 'workflow',
        related_resource: {
          type: PAYMENT_RECEIPT_RESOURCE_TYPE,
          id: c.paymentId,
          event: 'payment_recorded',
          auto: c.trigger === 'auto',
        },
      })
      if (!error) return { ok: true }
      // 23505 unique_violation on the primary key: this receipt was handled.
      if (error.code === '23505') return { ok: false, reason: 'exists' }
      throw fail('claim', error)
    },

    insertRecipient(communicationId, organizationId, r) {
      return shared.insertRecipient(communicationId, organizationId, {
        channel: 'email',
        userId: r.userId,
        unitId: r.unitId,
        name: r.name,
        email: r.email,
        phone: null,
      })
    },

    markRecipient: shared.markRecipient,
    finish: shared.finish,
  }
}
