import { createAdminClient } from '@homeowner-portal/db'
import { inngest } from './client'

const STALE_THRESHOLD_HOURS = 24
const REMINDER_COOLDOWN_HOURS = 72 // don't ping the same draft more often

/**
 * Daily 8am ET, walk wizard_drafts that:
 *  (a) aren't completed
 *  (b) haven't been touched in STALE_THRESHOLD_HOURS
 *  (c) haven't been reminded in REMINDER_COOLDOWN_HOURS
 * and write an audit_log nudge for each. The dashboard reads
 * audit_log entries with action='wizard_draft_reminder' and surfaces
 * them as soft prompts ("you started a violation 2 days ago — finish?").
 *
 * Phase 1 stops at audit_log + the dashboard widget. Phase 2 will pull
 * in Resend (or Supabase Auth emails) to actually email the user.
 */
export const wizardDraftRemindersJob = inngest.createFunction(
  { id: 'wizard-draft-reminders', name: 'Wizard Draft Follow-ups' },
  { cron: 'TZ=America/New_York 0 8 * * *' },
  async ({ logger }) => {
    const db = createAdminClient()
    const now = new Date()
    const staleSince = new Date(now.getTime() - STALE_THRESHOLD_HOURS * 3_600_000).toISOString()
    const cooldownSince = new Date(
      now.getTime() - REMINDER_COOLDOWN_HOURS * 3_600_000,
    ).toISOString()

    const { data: drafts, error } = await db
      .from('wizard_drafts')
      .select('id, org_id, user_id, kind, current_step, updated_at, notified_at')
      .eq('completed', false)
      .lt('updated_at', staleSince)

    if (error) {
      logger.error('[wizard-draft-reminders] failed to load drafts', error)
      throw new Error(error.message)
    }

    let logged = 0
    let skipped = 0

    for (const d of drafts ?? []) {
      // Cooldown: skip drafts we've already pinged recently.
      if (d.notified_at && d.notified_at > cooldownSince) {
        skipped += 1
        continue
      }

      const { error: auditError } = await db.from('audit_log').insert({
        action: 'wizard_draft_reminder',
        entity_type: 'wizard_draft',
        entity_id: d.id as string,
        org_id: (d.org_id as string) ?? null,
        user_id: (d.user_id as string) ?? null,
        metadata: {
          kind: d.kind,
          current_step: d.current_step,
          last_edited: d.updated_at,
        },
      })

      if (auditError) {
        logger.warn(
          `[wizard-draft-reminders] audit_log insert failed for ${d.id}: ${auditError.message}`,
        )
        continue
      }

      // Stamp notified_at so we respect the cooldown next run.
      await db
        .from('wizard_drafts')
        .update({ notified_at: now.toISOString() })
        .eq('id', d.id as string)

      logged += 1
    }

    return { evaluated: (drafts ?? []).length, logged, skipped }
  },
)
