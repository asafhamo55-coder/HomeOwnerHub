/**
 * Round 16 — the Supabase side of the statement email runner
 * (statement-run.ts).
 *
 * Runs with the BOARD MEMBER's own RLS client, like receipt-store.ts. Every
 * read is scoped to the caller's org. The owners' addresses come from the
 * `ownerships` rows of the home's unit, the same source receipts use; the
 * client never supplies one. Reads and writes throw on error with the code
 * only, because a PostgrestError message can echo row values.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchOrgSandbox } from '@homeowner-portal/observability/outbound-guard'
import { formatDay } from '@/lib/money/format'
import { asPropertyId, resolveUnitForProperty } from '@/lib/properties/resolve'
import { loadOwnerStatement } from '@/lib/properties/statement/load'
import { statementBetween } from '@/lib/resident-ledger'
import type { ReceiptOwner } from './receipt-run'
import { supabaseResidentNotifyStore } from './store'
import {
  maskEmail,
  STATEMENT_AUDIT_ACTION,
  STATEMENT_RESOURCE_TYPE,
  type StatementContext,
  type StatementEmailStore,
} from './statement-run'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

function fail(what: string, error: { code?: string } | null): Error {
  return new Error(`statement-email: ${what} failed (${error?.code ?? 'unknown'})`)
}

type OwnerRow = { owner_user_id: string | null; owner_name: string | null; owner_email: string | null }

/** The current owners of one unit. Org-scoped through the unit row's own RLS and filter. */
async function loadOwners(db: Db, unitId: string): Promise<ReceiptOwner[]> {
  const o = await db
    .from('ownerships')
    .select('owner_user_id, owner_name, owner_email')
    .eq('unit_id', unitId)
    .is('valid_to', null)
    .limit(50)
  if (o.error) throw fail('ownership read', o.error)
  return ((o.data ?? []) as OwnerRow[]).map((r) => ({ userId: r.owner_user_id, name: r.owner_name, email: r.owner_email }))
}

/**
 * Masked addresses for the confirm dialog: the board sees j***@example.com,
 * never the full address. Empty when the home has no unit or no email.
 */
export async function loadStatementRecipientPreview(db: Db, organizationId: string, propertyId: string): Promise<string[]> {
  const unit = await resolveUnitForProperty(db as unknown as SupabaseClient, organizationId, asPropertyId(propertyId))
  if (!unit.unitId) return []
  const owners = await loadOwners(db, unit.unitId)
  const seen = new Set<string>()
  const out: string[] = []
  for (const o of owners) {
    const email = o.email?.trim()
    if (!email || seen.has(email.toLowerCase())) continue
    seen.add(email.toLowerCase())
    out.push(maskEmail(email))
  }
  return out
}

export function supabaseStatementEmailStore(db: Db): StatementEmailStore {
  const shared = supabaseResidentNotifyStore(db)
  return {
    async loadContext(event): Promise<StatementContext | null> {
      const propertyId = asPropertyId(event.propertyId)
      const statement = await loadOwnerStatement(db as unknown as SupabaseClient, event.organizationId, propertyId)
      if (!statement) return null
      const unit = await resolveUnitForProperty(db as unknown as SupabaseClient, event.organizationId, propertyId)
      if (!unit.unitId) return null

      const u = await db
        .from('units')
        .select('association_id')
        .eq('organization_id', event.organizationId)
        .eq('id', unit.unitId)
        .maybeSingle()
      if (u.error) throw fail('unit read', u.error)
      const associationId = (u.data as { association_id: string | null } | null)?.association_id
      if (!associationId) return null

      const a = await db
        .from('associations')
        .select('id, name, type, organization_id')
        .eq('id', associationId)
        .eq('organization_id', event.organizationId)
        .maybeSingle()
      if (a.error) throw fail('association read', a.error)
      const assoc = a.data as { id: string; name: string; type: string | null; organization_id: string } | null
      if (!assoc) return null

      const w = statementBetween(statement.ledger, event.from, event.to)
      return {
        association: { id: assoc.id, name: assoc.name, type: assoc.type, organizationId: assoc.organization_id },
        unitId: unit.unitId,
        home: statement.home,
        statementDate: statement.today,
        period: `${formatDay(event.from)} – ${formatDay(event.to)}`,
        openingBalance: w.openingBalance,
        charges: w.totals.charges,
        paymentsAndCredits: w.totals.payments + w.totals.credits,
        closingBalance: w.closingBalance,
        lines: w.entries.map((e) => ({
          date: e.date,
          description: e.description,
          charge: e.charge,
          payment: e.payment,
          balance: e.balance,
        })),
        owners: await loadOwners(db, unit.unitId),
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

    async recentStatement(unitId, sinceIso) {
      // Narrowed in JS rather than with a JSON-path filter: the set of
      // communications in a day is small, and a rejected filter would
      // silently disable the dedupe.
      const { data, error } = await db
        .from('communications')
        .select('status, related_resource')
        .eq('source', 'workflow')
        .gte('created_at', sinceIso)
        .limit(500)
      if (error) throw fail('recent statements read', error)
      return ((data ?? []) as Array<{ status: string | null; related_resource: { type?: string; unit_id?: string } | null }>).some(
        (r) =>
          r.related_resource?.type === STATEMENT_RESOURCE_TYPE &&
          r.related_resource?.unit_id === unitId &&
          r.status !== 'failed' &&
          r.status !== 'cancelled',
      )
    },

    async claim(c) {
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
        audience_definition: { kind: 'unit_owners', unit_id: c.unitId, summary: 'Account statement: 1 home' },
        audience_summary: `Account statement: ${c.recipientCount} ${c.recipientCount === 1 ? 'owner' : 'owners'}`,
        status: 'sending',
        source: 'workflow',
        related_resource: {
          type: STATEMENT_RESOURCE_TYPE,
          id: c.propertyId,
          unit_id: c.unitId,
          from: c.from,
          to: c.to,
        },
      })
      if (!error) return { ok: true }
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

    async audit(a) {
      const { error } = await db.from('audit_log').insert({
        org_id: a.organizationId,
        user_id: a.actorUserId,
        action: STATEMENT_AUDIT_ACTION,
        entity_type: 'property',
        entity_id: a.propertyId,
        // Ids, an outcome and a count. No address, name or figure.
        metadata: { actor_role: a.actorRole, communication_id: a.communicationId, outcome: a.outcome, recipients: a.recipients },
      })
      if (error) throw fail('audit write', error)
    },
  }
}
