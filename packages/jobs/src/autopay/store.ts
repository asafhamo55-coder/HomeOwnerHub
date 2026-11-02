/**
 * BL-036 autopay: the Supabase-backed store (service role). Every M8 table is
 * reached through a narrow cast, and the job checks M8_APPLIED before building
 * this. Notices and over-max claims are audit_log rows written by the job
 * itself (user_id null), the same pattern as billing-renewal.
 */

import { fetchOrgSandbox } from '@homeowner-portal/observability/outbound-guard'
import { associationTimeZone, todayIn, ASSOCIATION_ZONE_COLUMNS } from '../association-time'
import { loadBoardRecipients } from '../daily-digest'
import { addDays, type AutopayCharge } from './decide'
import type { AttemptInput, AutopayEnrollment, AutopayStore } from './run'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export const AUTOPAY_NOTICE_AUDIT = 'autopay.notice'
export const AUTOPAY_OVER_MAX_AUDIT = 'autopay.over_max_notice'
/** Notices older than this no longer count as "named"; a charge unpaid that long is noticed again. */
const NOTICE_LOOKBACK_DAYS = 90

function fail(stage: string, error: { code?: string } | null): never {
  throw Object.assign(new Error(`autopay_${stage}_failed`), { code: error?.code })
}

const toCents = (n: number | string) => Math.round(Number(n) * 100)

export function createAutopayStore(db: Db, cap = 2000): AutopayStore {
  return {
    async listActive() {
      const { data, error } = await db
        .from('autopay_enrollments')
        .select(
          'id, organization_id, association_id, unit_id, user_id, max_cents, include_other_charges, consecutive_failures,' +
            ' method:online_payment_methods(id, method_type, brand, last4, stripe_payment_method_id, stripe_customer_id, stripe_account_id, is_active),' +
            ' org:orgs(name), unit:units(unit_number, address_line1), assoc:associations(' +
            ASSOCIATION_ZONE_COLUMNS +
            ')',
        )
        .eq('status', 'active')
        .range(0, cap - 1)
      if (error) fail('list', error)
      const rows = (data ?? []) as Array<Record<string, any>> // eslint-disable-line @typescript-eslint/no-explicit-any
      if (rows.length === 0) return []

      const assocIds = [...new Set(rows.map((r) => r.association_id as string))]
      const { data: accts, error: aerr } = await db
        .from('association_stripe_accounts')
        .select('association_id, charges_enabled, online_payments_enabled')
        .in('association_id', assocIds)
      if (aerr) fail('accounts', aerr)
      const ready = new Map<string, boolean>(
        ((accts ?? []) as Array<{ association_id: string; charges_enabled: boolean; online_payments_enabled: boolean }>).map((a) => [
          a.association_id,
          a.charges_enabled && a.online_payments_enabled,
        ]),
      )

      const unitIds = [...new Set(rows.map((r) => r.unit_id as string))]
      const { data: owns, error: oerr } = await db
        .from('ownerships')
        .select('unit_id, owner_user_id')
        .in('unit_id', unitIds)
        .is('valid_to', null)
      if (oerr) fail('ownerships', oerr)
      const owner = new Set(((owns ?? []) as Array<{ unit_id: string; owner_user_id: string }>).map((o) => `${o.unit_id}:${o.owner_user_id}`))

      const userIds = [...new Set(rows.map((r) => r.user_id as string))]
      const { data: profs, error: perr } = await db.from('profiles').select('id, email').in('id', userIds)
      if (perr) fail('profiles', perr)
      const email = new Map(((profs ?? []) as Array<{ id: string; email: string | null }>).map((p) => [p.id, p.email?.trim() || null]))

      const now = new Date()
      return rows.map((r): AutopayEnrollment => {
        const m = r.method ?? {}
        return {
          id: r.id,
          orgId: r.organization_id,
          orgName: r.org?.name ?? 'your association',
          associationId: r.association_id,
          unitId: r.unit_id,
          unitLabel: r.unit?.unit_number ? `Unit ${r.unit.unit_number}` : (r.unit?.address_line1 ?? 'a home'),
          userId: r.user_id,
          ownerEmail: email.get(r.user_id) ?? null,
          maxCents: r.max_cents,
          includeOtherCharges: r.include_other_charges,
          consecutiveFailures: r.consecutive_failures,
          stillOwner: owner.has(`${r.unit_id}:${r.user_id}`),
          paymentsReady: ready.get(r.association_id) === true,
          today: todayIn(associationTimeZone(r.assoc), now),
          method: {
            id: m.id,
            type: m.method_type,
            brand: m.brand ?? null,
            last4: m.last4 ?? null,
            stripePaymentMethodId: m.stripe_payment_method_id,
            stripeCustomerId: m.stripe_customer_id,
            stripeAccountId: m.stripe_account_id,
            isActive: m.is_active === true,
          },
        }
      })
    },

    async openCharges(e): Promise<AutopayCharge[]> {
      const { data, error } = await db
        .from('assessments')
        .select('id, assessment_type, due_date, amount, payments(amount)')
        .eq('unit_id', e.unitId)
        .in('status', ['open', 'partial'])
        .is('deleted_at', null)
        .order('due_date', { ascending: true })
        .range(0, 999)
      if (error) fail('charges', error)
      return ((data ?? []) as Array<{ id: string; assessment_type: string; due_date: string; amount: number; payments: Array<{ amount: number }> | null }>).map(
        (r) => ({
          id: r.id,
          type: r.assessment_type,
          dueDate: r.due_date,
          remainingCents: Math.max(0, toCents(r.amount) - (r.payments ?? []).reduce((s, p) => s + toCents(p.amount), 0)),
        }),
      )
    },

    async noticedCharges(e) {
      const since = new Date(`${addDays(e.today, -NOTICE_LOOKBACK_DAYS)}T00:00:00Z`).toISOString()
      const { data, error } = await db
        .from('audit_log')
        .select('metadata')
        .eq('org_id', e.orgId)
        .eq('action', AUTOPAY_NOTICE_AUDIT)
        .contains('metadata', { enrollment_id: e.id })
        .is('user_id', null)
        .gte('created_at', since)
        .limit(500)
      if (error) fail('notices', error)
      const out = new Map<string, number>()
      for (const row of (data ?? []) as Array<{ metadata: { charges?: Array<{ id: string; cents: number }> } }>) {
        for (const c of row.metadata?.charges ?? []) out.set(c.id, c.cents)
      }
      return out
    },

    async recordNotice(e, period, charges) {
      const { error } = await db.from('audit_log').insert({
        action: AUTOPAY_NOTICE_AUDIT,
        org_id: e.orgId,
        entity_type: 'autopay_enrollment',
        entity_id: e.id,
        metadata: { enrollment_id: e.id, period, charges },
      })
      return !error
    },

    async claim(kind, e, period) {
      const action = AUTOPAY_OVER_MAX_AUDIT
      const { data, error } = await db
        .from('audit_log')
        .select('id')
        .eq('org_id', e.orgId)
        .eq('action', action)
        .contains('metadata', { enrollment_id: e.id, period })
        .is('user_id', null)
        .limit(1)
      if (error) fail('claim_read', error)
      if (Array.isArray(data) && data.length > 0) return false
      const ins = await db.from('audit_log').insert({
        action,
        org_id: e.orgId,
        entity_type: 'autopay_enrollment',
        entity_id: e.id,
        metadata: { enrollment_id: e.id, period, kind },
      })
      return !ins.error
    },

    async hasLiveAttempt(enrollmentId, period) {
      const { data, error } = await db
        .from('online_payments')
        .select('id')
        .eq('autopay_enrollment_id', enrollmentId)
        .eq('autopay_period', period)
        .not('status', 'in', '(failed,canceled)')
        .limit(1)
      if (error) fail('attempt_read', error)
      return Array.isArray(data) && data.length > 0
    },

    async createAttempt(e, a: AttemptInput) {
      const { data, error } = await db
        .from('online_payments')
        .insert({
          organization_id: e.orgId,
          association_id: e.associationId,
          unit_id: e.unitId,
          user_id: e.userId,
          source: 'autopay',
          autopay_enrollment_id: e.id,
          autopay_period: a.period,
          method_type: e.method.type,
          online_payment_method_id: e.method.id,
          dues_cents: a.duesCents,
          fee_cents: a.feeCents,
          fee_payer: a.feePayer,
          total_cents: a.totalCents,
          application_fee_cents: a.applicationFeeCents,
          allocation: a.allocation,
          allocation_mode: a.allocationMode,
          status: 'created',
          stripe_account_id: e.method.stripeAccountId,
          idempotency_key: a.idempotencyKey,
        })
        .select('id')
        .single()
      if (error) {
        if (error.code === '23505') return null
        fail('attempt_create', error)
      }
      return { id: (data as { id: string }).id }
    },

    async updateAttempt(id, patch) {
      const { error } = await db
        .from('online_payments')
        .update({
          status: patch.status,
          ...(patch.paymentIntentId !== undefined ? { stripe_payment_intent_id: patch.paymentIntentId } : {}),
          ...(patch.failureCode !== undefined ? { failure_code: patch.failureCode } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) fail('attempt_update', error)
    },

    async setFailures(enrollmentId, consecutiveFailures, paused) {
      const { error } = await db
        .from('autopay_enrollments')
        .update({
          consecutive_failures: consecutiveFailures,
          ...(paused ? { status: 'paused' } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', enrollmentId)
      if (error) fail('failures', error)
    },

    async cancel(enrollmentId) {
      const now = new Date().toISOString()
      const { error } = await db
        .from('autopay_enrollments')
        .update({ status: 'canceled', canceled_at: now, updated_at: now })
        .eq('id', enrollmentId)
      if (error) fail('cancel', error)
    },

    async boardEmails(orgId) {
      return (await loadBoardRecipients(db, orgId)).map((r) => r.email)
    },

    orgSandbox: (orgId) => fetchOrgSandbox(db, orgId),

    async audit(action, e, metadata) {
      const { error } = await db.from('audit_log').insert({
        action,
        org_id: e.orgId,
        entity_type: 'autopay_enrollment',
        entity_id: e.id,
        metadata: { enrollment_id: e.id, ...metadata },
      })
      if (error) console.error('[autopay] audit write failed', { code: error.code ?? null })
    },
  }
}
