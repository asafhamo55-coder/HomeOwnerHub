import { createAdminClient } from '@homeowner-portal/db'
import { inngest } from './client'

/**
 * Monthly state-law freshness check.
 *
 * Fires at 03:00 ET on the 1st of every month. For each supported
 * state, finds statutes whose `fetched_at` is older than 30 days (or
 * NULL) and emits a `state_law.refresh_requested` audit row. The
 * actual scraping happens out-of-band — Vercel serverless can't host
 * Playwright/Chromium, so a platform admin (or a separately-deployed
 * worker) needs to run `pnpm scrape:state-law <STATE> --apply` to
 * fulfill the request.
 *
 * Why the audit-row pattern instead of triggering the scrape inline:
 *   - Playwright requires ~150MB Chromium binary; Vercel serverless
 *     functions cap unzipped size at 250MB.
 *   - Cold-start + scrape would blow past the 60s function timeout.
 *   - The audit row gives us a queryable backlog for a future worker
 *     (GitHub Actions, Browserless, dedicated VPS) to consume.
 *
 * If you later add such a worker: poll
 *   SELECT * FROM platform_admin_audit
 *     WHERE action = 'state_law.refresh_requested'
 *       AND (payload->>'fulfilled_at') IS NULL
 * mark rows as fulfilled when the scrape completes.
 */
export const stateLawRefreshJob = inngest.createFunction(
  { id: 'state-law-refresh', name: 'State Law Monthly Refresh Check' },
  { cron: 'TZ=America/New_York 0 3 1 * *' },
  async ({ logger }) => {
    const db = createAdminClient()

    const supported = ['GA', 'FL', 'CA', 'TX']
    const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()

    const report: Array<{ state: string; stale: number; total: number }> = []

    for (const state of supported) {
      const { count: total } = await db
        .from('state_statutes')
        .select('id', { count: 'exact', head: true })
        .eq('state', state)

      const { count: stale } = await db
        .from('state_statutes')
        .select('id', { count: 'exact', head: true })
        .eq('state', state)
        .or(`fetched_at.is.null,fetched_at.lt.${thirtyDaysAgoIso}`)

      const totalCount = total ?? 0
      const staleCount = stale ?? 0
      report.push({ state, stale: staleCount, total: totalCount })

      // Only request a refresh if the state actually has statutes AND
      // some are stale. Skipping empty states avoids spammy audit rows
      // for jurisdictions we haven't seeded yet.
      if (totalCount > 0 && staleCount > 0) {
        await db
          .from('platform_admin_audit' as never)
          .insert({
            action: 'state_law.refresh_requested',
            target_org_id: null,
            payload: {
              state,
              stale,
              total,
              triggered_by: 'monthly_cron',
              requested_at: new Date().toISOString(),
            },
          } as never)
        logger.info(
          `[state-law-refresh] ${state}: ${staleCount}/${totalCount} stale — refresh queued`,
        )
      } else {
        logger.info(
          `[state-law-refresh] ${state}: ${staleCount}/${totalCount} stale — skip`,
        )
      }
    }

    return { report }
  },
)
