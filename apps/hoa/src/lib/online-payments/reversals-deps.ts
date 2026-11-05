/**
 * BL-035 PR 6: the real store and notifier behind reversals.ts. Service role
 * (a webhook has no user session). Server only; imported by the webhook route
 * and the board refund action, never by a client component.
 *
 * Reads and writes throw with the code only: a PostgrestError message can echo
 * row values. Mail goes through sendEmail, which runs the outbound guard
 * (BL-004), with the org's sandbox flag; sandbox orgs reach the allowlist only.
 */

import { createAdminClient } from '@homeowner-portal/db'
import { fetchOrgSandbox } from '@homeowner-portal/observability/outbound-guard'
import { appUrl, sendEmail } from '@/lib/email'
import { getStripeConnect } from '@/lib/payments/stripe-connect'
import { fetchBoardMembers } from '@/lib/communications/audience'
import {
  ReverseRefused,
  type AttemptView,
  type NoticeContext,
  type ReversalDeps,
  type ReversalNotifier,
  type ReversalStore,
} from './reversals'
import type { Notice } from './reversal-notices'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: { code?: string } | null }> }

function fail(what: string, error: { code?: string } | null): Error {
  return new Error(`online-payments: ${what} failed (${error?.code ?? 'unknown'})`)
}

type AttemptRow = {
  id: string
  organization_id: string
  association_id: string
  unit_id: string
  user_id: string | null
  method_type: 'ach' | 'card'
  status: AttemptView['status']
  stripe_account_id: string
  total_cents: number
  dues_cents: number
  fee_cents: number
  fee_payer: 'association' | 'homeowner'
  posted_at: string | null
  posted_result: Array<{ cents?: number }> | null
}

const ATTEMPT_COLUMNS =
  'id, organization_id, association_id, unit_id, user_id, method_type, status, stripe_account_id, total_cents, dues_cents, fee_cents, fee_payer, posted_at, posted_result'

export function supabaseReversalStore(db: Db): ReversalStore {
  return {
    async findAttempt(key) {
      let q = db.from('online_payments').select(ATTEMPT_COLUMNS)
      if (key.paymentIntentId) q = q.eq('stripe_payment_intent_id', key.paymentIntentId)
      else if (key.chargeId) q = q.eq('stripe_charge_id', key.chargeId)
      else return null
      const { data, error } = await q.maybeSingle()
      if (error) throw fail('read attempt', error)
      if (!data) return null
      const row = data as AttemptRow

      const { data: adj, error: adjErr } = await db
        .from('online_payment_adjustments')
        .select('kind, amount_cents')
        .eq('online_payment_id', row.id)
        .in('kind', ['failed', 'refund', 'dispute_lost', 'refund_failed'])
      if (adjErr) throw fail('read adjustments', adjErr)
      // A refund_failed row (0082) gives back what a refund took, so it counts against the total.
      const reversed = ((adj ?? []) as Array<{ kind?: string; amount_cents: number }>).reduce(
        (n, a) => n + (a.kind === 'refund_failed' ? -a.amount_cents : a.amount_cents),
        0,
      )
      const posted = (row.posted_result ?? []).reduce((n, p) => n + (p.cents ?? 0), 0)

      return {
        id: row.id,
        organizationId: row.organization_id,
        associationId: row.association_id,
        unitId: row.unit_id,
        payerUserId: row.user_id,
        methodType: row.method_type,
        status: row.status,
        stripeAccountId: row.stripe_account_id,
        totalCents: row.total_cents,
        duesCents: row.dues_cents,
        feeCents: row.fee_cents,
        feePayer: row.fee_payer,
        postedAt: row.posted_at,
        postedCents: posted,
        reversedCents: reversed,
      }
    },

    async returnedFeeSetting(associationId) {
      const { data, error } = await db
        .from('association_stripe_accounts')
        .select('returned_payment_fee_cents')
        .eq('association_id', associationId)
        .maybeSingle()
      if (error) throw fail('read fee setting', error)
      return (data as { returned_payment_fee_cents: number | null } | null)?.returned_payment_fee_cents ?? null
    },

    async reverse(args) {
      const { data, error } = await db.rpc('reverse_online_payment', {
        p_attempt: args.attemptId,
        p_kind: args.kind,
        p_ref: args.ref,
        p_cents: args.cents ?? null,
        p_reason: args.reason ?? null,
        p_on: null,
        p_returned_fee_cents: args.returnedFeeCents ?? 0,
        p_by: args.by ?? null,
      })
      if (error) {
        if (error.code === '55000' || error.code === '23514') {
          // The RAISE text is fixed wording from migration 0082 (no row values); only the flag leaves here.
          const msg = (error as { message?: string }).message ?? ''
          // Tied to the exact RAISE wording in migrations/0082_money_integrity.sql ('books_not_open' from
          // reverse_online_payment, 'closed_period' from the posting trigger). A reword there silently
          // drops retries; migration-0082-wording.test.ts fails if the string disappears.
          // Tied to the exact RAISE wording in migrations/0082_money_integrity.sql ('books_not_open' from
          // reverse_online_payment, 'closed_period' from the posting trigger). A reword there silently
          // drops retries; migration-0082-wording.test.ts fails if the string disappears.
          throw new ReverseRefused(error.code, error.code === '55000' && (msg.includes('books_not_open') || msg.includes('closed_period')))
        }
        throw fail('reverse_online_payment', error)
      }
      const r = (data ?? {}) as {
        already_applied?: boolean
        status?: string
        reversed_cents?: number
        short_cents?: number
        returned_fee_id?: string | null
      }
      return {
        alreadyApplied: Boolean(r.already_applied),
        status: r.status ?? '',
        reversedCents: Number(r.reversed_cents ?? 0),
        shortCents: Number(r.short_cents ?? 0),
        returnedFeeCents: r.returned_fee_id ? (args.returnedFeeCents ?? 0) : 0,
      }
    },

    async noteRefundPending(args) {
      const { data: op } = await db.from('online_payments').select('organization_id').eq('id', args.attemptId).maybeSingle()
      if (!op) return
      const { error } = await db.from('audit_log').insert({
        org_id: (op as { organization_id: string }).organization_id,
        entity_type: 'online_payment',
        entity_id: args.attemptId,
        action: 'online_payment.refund_pending',
        user_id: args.by,
        metadata: { refund_id: args.ref, cents: args.cents, reason: 'requires_action' },
      })
      if (error) throw fail('note refund pending', error)
    },

    async markDisputed(attemptId) {
      const { data, error } = await db
        .from('online_payments')
        .update({ status: 'disputed' })
        .eq('id', attemptId)
        .in('status', ['succeeded', 'partially_refunded'])
        .select('id')
      if (error) throw fail('mark disputed', error)
      return Array.isArray(data) && data.length > 0
    },
  }
}

const logger = (msg: string, meta: Record<string, unknown>) => (meta.level === 'error' ? console.error(msg, meta) : console.warn(msg, meta))

export function supabaseReversalNotifier(db: Db): ReversalNotifier {
  async function context(attempt: AttemptView): Promise<NoticeContext> {
    const { data } = await db.from('associations').select('name').eq('id', attempt.associationId).maybeSingle()
    return {
      associationName: (data as { name?: string } | null)?.name ?? 'your association',
      payUrl: appUrl('/resident/dues/pay'),
      reviewUrl: appUrl('/accounting/ledger'),
    }
  }

  async function mail(attempt: AttemptView, to: string, notice: Notice, ref: string) {
    const orgSandbox = await fetchOrgSandbox(db as never, attempt.organizationId)
    const res = await sendEmail(
      { to, subject: notice.subject, text: notice.text, html: toHtml(notice.text) },
      { orgSandbox, ref },
    )
    // Held by the guard is expected in sandbox; ids only in the log.
    if (!res.ok) logger('[online-payments] notice not sent', { attemptId: attempt.id, ref })
  }

  return {
    async resident(attempt, build) {
      try {
        if (!attempt.payerUserId) return
        const { data } = await db.from('profiles').select('email').eq('id', attempt.payerUserId).maybeSingle()
        const email = (data as { email?: string | null } | null)?.email
        if (!email) return
        await mail(attempt, email, build(await context(attempt)), `op-${attempt.id}-resident`)
      } catch (err) {
        logger('[online-payments] resident notice failed', { attemptId: attempt.id, error: err instanceof Error ? err.name : 'unknown' })
      }
    },

    async board(attempt, kind, build, opts) {
      try {
        const notice = build(await context(attempt))
        const members = await fetchBoardMembers(attempt.organizationId, ['board', 'admin'])
        for (const m of members) {
          // In-app alert first (one per person per kind per payment; 23505 = already there).
          const { error } = await db.from('notifications').insert({
            organization_id: attempt.organizationId,
            user_id: m.userId,
            kind,
            title: notice.subject,
            body: notice.text.split('\n\n')[0] ?? null,
            link: '/accounting/ledger',
            entity_type: 'online_payment',
            entity_id: attempt.id,
          })
          if (error && error.code !== '23505') logger('[online-payments] alert insert failed', { attemptId: attempt.id, code: error.code ?? null })
          // emailOnce: email only when the alert row is newly inserted. 23505 means this person already
          // got it (a retry); any other insert error (already logged above) also skips the email, so a
          // broken insert cannot turn every Stripe retry into another email.
          if (opts?.emailOnce && error) continue
          if (m.email) await mail(attempt, m.email, notice, `op-${attempt.id}-${kind}`)
        }
      } catch (err) {
        logger('[online-payments] board notice failed', { attemptId: attempt.id, error: err instanceof Error ? err.name : 'unknown' })
      }
    },
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function toHtml(text: string): string {
  return text
    .split('\n\n')
    .map((p) => `<p style="font-size:16px;line-height:1.5">${escapeHtml(p)}</p>`)
    .join('')
}

/** The service-role wiring the webhook route and the refund action use. */
export function reversalDeps(): ReversalDeps {
  const db = createAdminClient() as unknown as Db
  return {
    store: supabaseReversalStore(db),
    notifier: supabaseReversalNotifier(db),
    log: logger,
    async listRefunds(account, chargeId) {
      const stripe = getStripeConnect()
      if (!stripe) throw new Error('stripe_not_configured')
      return stripe.listChargeRefunds(account, chargeId)
    },
  }
}
