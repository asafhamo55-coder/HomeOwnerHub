import { pickCurrentPeriod, planNextFiscalYear, type PeriodDates } from '@homeowner-portal/jobs/fiscal-periods'
import { formatDay, formatDayRange, periodLabel } from '@/lib/money/format'

/**
 * BL-076 "Open next fiscal year". Adds the next fiscal year's period(s) —
 * following the books' own structure (planNextFiscalYear) — as OPEN
 * periods, and writes one audit_log row. It never changes which period is
 * current: every "current period" read takes only periods that have
 * started (fiscal-periods.ts), so the new year waits for its first day.
 *
 * Idempotent: a second run finds nothing to add and says the year is
 * already open. A concurrent double-click loses on the table's
 * UNIQUE (association_id, start_date, end_date) and reads the same way.
 *
 * Runs on the caller's client (RLS: 0061 lets members write their org's
 * fiscal_periods); the admin-only gate is in fiscal-year-actions.ts.
 * Plain module, so it can be tested against an in-memory client.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (table: string) => any }

export type OpenNextFiscalYearResult =
  | { ok: true; created: number; label: string; message: string }
  | { ok: false; error: string }

export const OPEN_YEAR_ADMIN_ONLY = 'Only an admin of your HOA can open the next fiscal year.'

const READ_FAILED = 'We couldn’t read your fiscal periods just now, so nothing was changed. Try again.'
const WRITE_FAILED = 'We couldn’t open the next fiscal year just now, so nothing was changed. Try again.'

/** "FY 2027", or the date range for a non-calendar fiscal year. */
export function fiscalYearLabel(fy: PeriodDates): string {
  return periodLabel(fy)
}

export interface NextFiscalYearOffer {
  label: string
  range: string
  currentLabel: string | null
}

/**
 * What a page offers to open, from the periods it already loaded: null when
 * next year is already open or the books' structure can't be followed (the
 * action would only refuse). Pure.
 */
export function nextFiscalYearOffer(periods: readonly PeriodDates[], today: string): NextFiscalYearOffer | null {
  const plan = planNextFiscalYear(periods, today)
  if (!plan.ok || plan.toCreate.length === 0) return null
  const current = pickCurrentPeriod(periods, today)
  return {
    label: fiscalYearLabel(plan.fiscalYear),
    range: formatDayRange(plan.fiscalYear.start_date, plan.fiscalYear.end_date),
    currentLabel: current ? periodLabel(current) : null,
  }
}

export async function openNextFiscalYearCore(
  db: AnyClient,
  opts: { orgId: string; associationId: string; userId: string | null; today: string },
): Promise<OpenNextFiscalYearResult> {
  const { orgId, associationId, userId, today } = opts

  const read = await db.from('fiscal_periods').select('id, start_date, end_date, status').eq('association_id', associationId)
  if (read.error) {
    console.error('[fiscal-year] periods read failed', { code: read.error.code ?? null })
    return { ok: false, error: READ_FAILED }
  }
  const plan = planNextFiscalYear((read.data ?? []) as PeriodDates[], today)
  if (!plan.ok) {
    if (plan.reason === 'no_periods') {
      return { ok: false, error: 'Your association’s books aren’t open yet, so there’s no fiscal year to follow. Open the books first.' }
    }
    if (plan.reason === 'too_far_behind') {
      return {
        ok: false,
        error: 'Your books end more than a year before the current fiscal year, so the next year can’t be opened in one step. Contact support to bring the books up to date.',
      }
    }
    return {
      ok: false,
      error: 'Your fiscal periods aren’t monthly, quarterly or yearly, so the next year can’t be opened automatically. Contact support to add it.',
    }
  }

  const label = fiscalYearLabel(plan.fiscalYear)
  const range = formatDayRange(plan.fiscalYear.start_date, plan.fiscalYear.end_date)
  if (plan.toCreate.length === 0) {
    return { ok: true, created: 0, label, message: `${label} is already open. Nothing was changed.` }
  }

  const ins = await db.from('fiscal_periods').insert(
    plan.toCreate.map((p) => ({
      organization_id: orgId,
      association_id: associationId,
      start_date: p.start_date,
      end_date: p.end_date,
      status: 'open',
    })),
  )
  if (ins.error) {
    // Someone opened it a moment ago (double-click, two admins).
    if (ins.error.code === '23505') return { ok: true, created: 0, label, message: `${label} is already open. Nothing was changed.` }
    console.error('[fiscal-year] periods insert failed', { code: ins.error.code ?? null })
    return { ok: false, error: WRITE_FAILED }
  }

  // Ids and dates only. Best effort: the periods exist either way.
  const audit = await db.from('audit_log').insert({
    action: 'fiscal_year_opened',
    org_id: orgId,
    user_id: userId,
    entity_type: 'association',
    entity_id: associationId,
    metadata: {
      fiscal_year_start: plan.fiscalYear.start_date,
      fiscal_year_end: plan.fiscalYear.end_date,
      period_months: plan.months,
      periods_created: plan.toCreate.length,
      first_start: plan.toCreate[0].start_date,
    },
  })
  if (audit.error) console.error('[fiscal-year] audit insert failed', { code: audit.error.code ?? null })

  const startsOn = formatDay(plan.fiscalYear.start_date)
  return {
    ok: true,
    created: plan.toCreate.length,
    label,
    message: `${label} (${range}) is open. You can save budgets to it now; entries keep posting to the current year until ${startsOn}.`,
  }
}
