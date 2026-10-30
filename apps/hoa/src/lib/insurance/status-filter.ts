import { REMINDER_WINDOW_DAYS, isActive, type CoverageCheck, type InsurancePolicy, type PolicyReminder } from './model'

/**
 * The insurance page's summary strip and `?status=` filter. Pure: it counts
 * and filters data the page already loaded, so a client file may import it.
 */
export type InsuranceStatus = 'active' | 'expiring' | 'expired' | 'missing'

export const INSURANCE_STATUSES: readonly InsuranceStatus[] = ['active', 'expiring', 'expired', 'missing']

export function parseInsuranceStatus(raw: string | undefined | null): InsuranceStatus | null {
  return INSURANCE_STATUSES.find((s) => s === raw) ?? null
}

/** A coverage finding that says a required kind of policy is absent. */
export function isMissingKindFinding(code: string): boolean {
  return /(^|_)missing(_|$)/.test(code)
}

export function missingKindMessages(checks: ReadonlyArray<{ check: CoverageCheck }>): string[] {
  return checks.flatMap((c) => c.check.findings.filter((f) => isMissingKindFinding(f.code)).map((f) => f.message))
}

export interface InsuranceCounts {
  active: number
  expiring: number
  expired: number
  missing: number
}

/** Policies behind each status. Renewed policies are not "expired": the reminders already leave them out. */
export function policiesForStatus(
  status: InsuranceStatus,
  policies: readonly InsurancePolicy[],
  reminders: readonly PolicyReminder[],
  today: string,
): InsurancePolicy[] {
  if (status === 'missing') return []
  if (status === 'active') return policies.filter((p) => isActive(p, today))
  const ids = new Set(
    reminders.filter((r) => (status === 'expired' ? r.tone === 'expired' : r.tone !== 'expired')).map((r) => r.policyId),
  )
  return policies.filter((p) => ids.has(p.id))
}

export function insuranceCounts(
  policies: readonly InsurancePolicy[],
  reminders: readonly PolicyReminder[],
  checks: ReadonlyArray<{ check: CoverageCheck }>,
  today: string,
): InsuranceCounts {
  return {
    active: policiesForStatus('active', policies, reminders, today).length,
    expiring: policiesForStatus('expiring', policies, reminders, today).length,
    expired: policiesForStatus('expired', policies, reminders, today).length,
    missing: missingKindMessages(checks).length,
  }
}

export const EXPIRING_LABEL = `Expiring within ${REMINDER_WINDOW_DAYS} days`

export const STATUS_EMPTY: Record<InsuranceStatus, { title: string; description: string }> = {
  active: { title: 'No policies in force', description: 'No policy covers today’s date. Add or renew one from its declarations page.' },
  expiring: { title: 'Nothing expiring soon', description: `No policy ends within the next ${REMINDER_WINDOW_DAYS} days.` },
  expired: { title: 'No expired policies', description: 'Every policy on record is in force, or has been renewed.' },
  missing: { title: 'No required policies missing', description: 'The coverage check found no required kind of policy that is absent.' },
}
