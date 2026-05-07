import { createAdminClient } from '@homeownerhub/db'
import { inngest } from './client'

/**
 * Each morning at 8am ET, find eviction cases whose cure period ends
 * today and mark them as filing-eligible. Phase 1 logs + writes an
 * audit_log row; Phase 2 will email the landlord via the
 * Resend/Supabase Auth email transport.
 *
 * Idempotency: we only act on cases where status is still 'notice_sent'
 * so re-running the same day after a partial failure doesn't loop.
 */
export const evictionReminderJob = inngest.createFunction(
  { id: 'eviction-reminders', name: 'Eviction Filing Reminders' },
  { cron: 'TZ=America/New_York 0 8 * * *' },
  async ({ logger }) => {
    const db = createAdminClient()
    const today = new Date().toISOString().slice(0, 10)

    const { data: cases, error } = await db
      .from('eviction_cases')
      .select(
        'id, org_id, user_id, property_address, tenant_name, filing_eligible_date',
      )
      .eq('status', 'notice_sent')
      .lte('filing_eligible_date', today)

    if (error) {
      logger.error('[eviction-reminders] failed to load cases', error)
      throw new Error(error.message)
    }

    let logged = 0
    for (const c of cases ?? []) {
      logger.info(
        `[eviction-reminders] case ${c.id} eligible to file: ${c.property_address}`,
      )

      const { error: auditError } = await db.from('audit_log').insert({
        action: 'eviction_filing_eligible',
        entity_type: 'eviction_case',
        entity_id: c.id as string,
        org_id: (c.org_id as string) ?? null,
        user_id: (c.user_id as string) ?? null,
        metadata: {
          property_address: c.property_address,
          tenant_name: c.tenant_name,
          filing_eligible_date: c.filing_eligible_date,
        },
      })

      if (auditError) {
        logger.warn(
          `[eviction-reminders] audit_log insert failed for ${c.id}: ${auditError.message}`,
        )
        continue
      }
      logged += 1
    }

    return { evaluated: (cases ?? []).length, logged }
  },
)
