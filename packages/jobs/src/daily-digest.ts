import { generateDailyDigest } from '@homeowner-portal/ai'
import { createAdminClient } from '@homeowner-portal/db'
import { inngest } from './client'

/**
 * Regenerate the Daily Digest for every active HOA org at 7am Eastern.
 * Each org runs in its own step so a single failure doesn't kill the run;
 * Inngest checkpoints state between steps and retries individually.
 *
 * Plan != 'free' filter is the basic monetization gate — free-tier orgs
 * don't get the auto-refreshed digest, just the on-demand version they
 * trigger from the dashboard.
 */
export const dailyDigestJob = inngest.createFunction(
  { id: 'daily-digest', name: 'Generate Daily Digest' },
  { cron: 'TZ=America/New_York 0 7 * * *' },
  async ({ step, logger }) => {
    const db = createAdminClient()

    const { data: orgs, error } = await db
      .from('orgs')
      .select('id, name')
      .eq('hub_type', 'hoa')
      .neq('plan', 'free')

    if (error) {
      logger.error('[daily-digest] failed to load orgs', error)
      throw new Error(error.message)
    }

    let success = 0
    let failed = 0

    for (const org of orgs ?? []) {
      const orgId = org.id as string
      const orgName = org.name as string

      const result = await step.run(`digest-${orgId}`, async () => {
        const today = new Date().toISOString().slice(0, 10)

        // Resident-submitted queues the board must action. Cast to a loose
        // client: `tickets` isn't in the generated Database type, and the
        // service-role client bypasses RLS so we scope by organization_id.
        const anyDb = db as unknown as {
          from: (table: string) => any
        }
        const queueCount = (
          table: string,
          statuses: string[],
          withDeletedAt: boolean,
        ) => {
          let qb = anyDb
            .from(table)
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .in('status', statuses)
          if (withDeletedAt) qb = qb.is('deleted_at', null)
          return qb
        }

        // Pull the same counts the dashboard renders so the digest's tone
        // matches what the user will see when they sign in.
        const [open, overdue, pending, dues, tickets, arc, concerns] =
          await Promise.all([
          db
            .from('hoa_violations')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .in('status', ['open', 'notice_sent']),

          db
            .from('hoa_violations')
            .select('notice_sent_at, cure_period_days')
            .eq('org_id', orgId)
            .eq('status', 'notice_sent')
            .not('notice_sent_at', 'is', null),

          db
            .from('hoa_violations')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .not('ai_draft_letter', 'is', null)
            .is('approved_at', null),

          db
            .from('hoa_dues')
            .select('amount_due, amount_paid, late_fee')
            .eq('org_id', orgId)
            .neq('status', 'paid')
            .lt('due_date', today),

          queueCount('tickets', ['open', 'in_progress'], true),
          queueCount('arc_requests', ['submitted', 'in_review'], true),
          queueCount('resident_violation_reports', ['submitted', 'under_review'], false),
        ])

        const overdueCount = (overdue.data ?? []).filter((v) => {
          if (!v.notice_sent_at || !v.cure_period_days) return false
          const sent = new Date(v.notice_sent_at)
          const cureDeadline = new Date(
            sent.getTime() + v.cure_period_days * 86_400_000,
          )
          return cureDeadline < new Date()
        }).length

        const overdueAmount = (dues.data ?? []).reduce((sum, row) => {
          const remaining =
            (row.amount_due ?? 0) + (row.late_fee ?? 0) - (row.amount_paid ?? 0)
          return sum + Math.max(remaining, 0)
        }, 0)

        let content: string
        try {
          content = await generateDailyDigest({
            hoaName: orgName,
            openViolations: open.count ?? 0,
            overdueViolations: overdueCount,
            overdueAmount,
            pendingApprovals: pending.count ?? 0,
            openTickets: tickets.count ?? 0,
            openArcRequests: arc.count ?? 0,
            openConcerns: concerns.count ?? 0,
            upcomingMeetings: [],
          })
        } catch (err) {
          // AI unavailable — skip this org for today rather than persist a
          // failure message into the digest table.
          return {
            ok: false as const,
            error: err instanceof Error ? err.message : 'ai_unavailable',
          }
        }

        if (!content?.trim()) {
          return { ok: false as const, error: 'empty_response' }
        }

        const { error: upsertError } = await db.from('hoa_digests').upsert({
          org_id: orgId,
          content: content.trim(),
          generated_at: new Date().toISOString(),
        })

        if (upsertError) {
          return { ok: false as const, error: upsertError.message }
        }

        return { ok: true as const }
      })

      if (result.ok) success += 1
      else {
        failed += 1
        logger.warn(`[daily-digest] org ${orgId} failed: ${result.error}`)
      }
    }

    return { processed: (orgs ?? []).length, success, failed }
  },
)
