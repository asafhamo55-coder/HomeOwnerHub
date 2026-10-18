import { createAdminClient } from '@homeowner-portal/db'
import { inngest } from '../client'
import { MONTHLY_REPORT_CRON } from './period'
import {
  runMonthlyBoardReport,
  runRequestedMonthlyReport,
  supabaseMonthlyReportStore,
  type MonthlyReportDb,
  type MonthlyReportDeps,
  type OrgRunResult,
} from './run'

/**
 * Month-end board report (BL-073): 08:00 Eastern on the 1st, and on demand
 * from the "Send now" button on /accounting/reports.
 *
 * A factory, like createDailyDigestJob: the guarded sendEmail (BL-004) and
 * the report builder (the board packet's loaders) live in apps/hoa, which
 * depends on this package.
 *
 * Idempotency is the deterministic communications id per org + month
 * (run.ts); each org runs in its own step so a retry replays finished orgs
 * from memo. The Send-now event is also sent with an id per org + month, so
 * a double click is deduplicated by Inngest before it gets here.
 */
export function createMonthlyBoardReportJob(deps: MonthlyReportDeps) {
  return inngest.createFunction(
    { id: 'monthly-board-report', name: 'Month-end board report', concurrency: { limit: 1 } },
    [{ cron: MONTHLY_REPORT_CRON }, { event: 'board/monthly-report.requested' }],
    async ({ event, step, logger }) => {
      const store = supabaseMonthlyReportStore(createAdminClient() as unknown as MonthlyReportDb)
      const runStep = async (name: string, fn: () => Promise<OrgRunResult>) =>
        (await step.run(name, fn)) as OrgRunResult
      if (event.name === 'board/monthly-report.requested') {
        const data = (event.data ?? {}) as { orgId?: unknown; month?: unknown }
        if (typeof data.orgId !== 'string') return { status: 'skipped', month: null, reason: 'org_not_found' }
        const month = typeof data.month === 'string' ? data.month : null
        return runRequestedMonthlyReport(store, deps, { orgId: data.orgId, month }, new Date(), logger, runStep)
      }
      return runMonthlyBoardReport(store, deps, new Date(), logger, runStep)
    },
  )
}
