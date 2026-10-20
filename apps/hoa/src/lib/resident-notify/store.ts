/**
 * BL-082 — the Supabase side of the resident notification runner (run.ts).
 *
 * Runs with the BOARD MEMBER's own RLS client: the board can read the
 * application / ticket, the resident's profile, contacts and
 * communication preferences (0063), and writes communications rows like
 * every other board send. Reads and writes throw on error with the code
 * only — a PostgrestError message can echo row values.
 */

import { fetchOrgSandbox } from '@homeowner-portal/observability/outbound-guard'
import { loadUserSmsConsent } from '@/lib/sms-consent-ledger'
import type { NotifyContext, ResidentNotifyEvent, ResidentNotifyStore } from './run'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

function fail(what: string, error: { code?: string } | null): Error {
  return new Error(`resident-notify: ${what} failed (${error?.code ?? 'unknown'})`)
}

type SourceRow = {
  id: string
  organization_id: string
  association_id: string | null
  unit_id: string | null
  submitted_by: string
  summary?: string
  subject?: string
  submitter: { full_name: string | null; email: string | null } | null
}

type AssocRow = { id: string; name: string; type: string | null; organization_id: string; compliance_settings: unknown }

export function supabaseResidentNotifyStore(db: Db): ResidentNotifyStore {
  return {
    async loadContext(event: ResidentNotifyEvent): Promise<NotifyContext | null> {
      const isTicket = event.kind === 'ticket_reply'
      const { data, error } = await db
        .from(isTicket ? 'tickets' : 'arc_requests')
        .select(
          isTicket
            ? 'id, organization_id, association_id, unit_id, submitted_by, subject, submitter:profiles!tickets_submitted_by_fkey(full_name, email)'
            : 'id, organization_id, association_id, unit_id, submitted_by, summary, submitter:profiles!arc_requests_submitted_by_fkey(full_name, email)',
        )
        .eq('id', isTicket ? event.ticketId : event.arcId)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw fail('record read', error)
      const row = data as SourceRow | null
      if (!row) return null

      // The row's own association; an older row without one belongs to the
      // org's primary (first by name — getPrimaryAssociation's rule).
      let q = db.from('associations').select('id, name, type, organization_id, compliance_settings')
      q = row.association_id
        ? q.eq('id', row.association_id)
        : q.eq('organization_id', row.organization_id).order('name', { ascending: true })
      const assoc = await q.limit(1)
      if (assoc.error) throw fail('association read', assoc.error)
      const a = ((assoc.data ?? []) as AssocRow[])[0]
      if (!a) return null

      return {
        association: {
          id: a.id,
          name: a.name,
          type: a.type,
          organizationId: a.organization_id,
          complianceSettings: a.compliance_settings,
        },
        resident: {
          userId: row.submitted_by,
          unitId: row.unit_id,
          name: row.submitter?.full_name ?? null,
          email: row.submitter?.email?.trim() || null,
          phone: null,
        },
        title: (isTicket ? row.subject : row.summary) ?? '',
      }
    },

    async loadPreferences(organizationId, userId) {
      const { data, error } = await db
        .from('resident_communication_preferences')
        .select('email_opt_in, sms_opt_in')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw fail('preferences read', error)
      const row = data as { email_opt_in: boolean; sms_opt_in: boolean } | null
      // The table's own defaults (0018): email on, SMS off.
      const prefs = { email: row ? row.email_opt_in !== false : true, sms: row ? row.sms_opt_in === true : false }
      if (!prefs.sms) return prefs
      // BL-111: the numbers the resident's latest consent covers.
      // The board's RLS client reads audit_log (0063 audit_log_select).
      const consent = await loadUserSmsConsent(db as never, organizationId, userId)
      if (!consent.ok) throw fail('sms consent read', { code: 'consent_read' })
      return { ...prefs, smsPhones: consent.phones }
    },

    async loadPhone(userId, unitId) {
      let owners = db.from('ownerships').select('owner_phone').eq('owner_user_id', userId).is('valid_to', null)
      if (unitId) owners = owners.eq('unit_id', unitId)
      const o = await owners.limit(1)
      if (o.error) throw fail('ownership read', o.error)
      const ownerPhone = ((o.data ?? []) as Array<{ owner_phone: string | null }>)[0]?.owner_phone?.trim()
      if (ownerPhone) return ownerPhone

      let tenants = db.from('tenancies').select('tenant_phone').eq('tenant_user_id', userId).eq('status', 'active')
      if (unitId) tenants = tenants.eq('unit_id', unitId)
      const t = await tenants.limit(1)
      if (t.error) throw fail('tenancy read', t.error)
      return ((t.data ?? []) as Array<{ tenant_phone: string | null }>)[0]?.tenant_phone?.trim() || null
    },

    orgSandbox(organizationId) {
      return fetchOrgSandbox(db, organizationId)
    },

    async claim(c) {
      const { error } = await db.from('communications').insert({
        id: c.id,
        organization_id: c.organizationId,
        association_id: c.associationId,
        category: c.category,
        subject: c.subject,
        body_html: c.html,
        body_text: c.text,
        channels: c.channels,
        // Ids only: the address lives on the recipient row.
        audience_definition: { kind: 'resident', user_id: c.residentUserId, summary: c.audienceSummary },
        audience_summary: c.audienceSummary,
        status: 'sending',
        source: 'workflow',
        related_resource: c.relatedResource,
      })
      if (!error) return { ok: true }
      // 23505 unique_violation on the primary key: this event was handled.
      if (error.code === '23505') return { ok: false, reason: 'exists' }
      throw fail('claim', error)
    },

    async insertRecipient(communicationId, organizationId, r) {
      const { data, error } = await db
        .from('communication_recipients')
        .insert({
          organization_id: organizationId,
          communication_id: communicationId,
          unit_id: r.unitId,
          user_id: r.userId,
          recipient_name: r.name,
          email: r.email,
          phone: r.phone,
          channel: r.channel,
          delivery_status: 'queued',
        })
        .select('id')
        .single()
      if (error || !data) throw fail('recipient insert', error)
      return { id: (data as { id: string }).id }
    },

    async markRecipient(id, outcome, renderedSubject) {
      const at = new Date().toISOString()
      const patch =
        outcome.status === 'sent'
          ? { delivery_status: 'sent', external_id: outcome.externalId, sent_at: at, rendered_subject: renderedSubject }
          : { delivery_status: outcome.status, error_message: outcome.error, failed_at: at, rendered_subject: renderedSubject }
      const { error } = await db.from('communication_recipients').update(patch).eq('id', id)
      if (error) throw fail('recipient update', error)
    },

    async finish(communicationId, status) {
      const { error } = await db
        .from('communications')
        .update({ status, sent_at: status === 'sent' ? new Date().toISOString() : null })
        .eq('id', communicationId)
      if (error) throw fail('status update', error)
    },
  }
}
