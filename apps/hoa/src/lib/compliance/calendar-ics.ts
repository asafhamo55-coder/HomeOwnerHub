/**
 * Round 14: the board's compliance calendar file. Pure; no I/O.
 *
 * All-day events for the next 12 months: each association's state and
 * federal compliance deadlines (./deadlines.ts) and the association's
 * insurance policy expiry dates. A policy event names only the kind of
 * policy. Never a policy number, carrier, amount or any person.
 *
 * UIDs are stable per (org, association or policy, deadline, date), so a
 * calendar that imports the file again updates the events instead of
 * duplicating them.
 */

import { buildIcsCalendar, type IcsEvent } from '../ics'
import { POLICY_KIND_LABELS, type InsurancePolicy } from '../insurance/model'
import { complianceState, deadlinesForState, type ComplianceDeadline } from './deadlines'

export const COMPLIANCE_ICS_FILENAME = 'compliance-deadlines.ics'
export const COMPLIANCE_ICS_DOMAIN = 'homeownerledger.com'
export const COMPLIANCE_ICS_PRODID = '-//HomeownerHub//Compliance deadlines//EN'
export const COMPLIANCE_ICS_MONTHS = 12

export interface CalendarAssociation {
  id: string
  name: string | null
  state: string | null
  governingLawState: string | null
}

export interface ComplianceCalendarInput {
  orgId: string
  associations: readonly CalendarAssociation[]
  policies: readonly InsurancePolicy[]
  /** YYYY-MM-DD in the association's zone. */
  today: string
  now?: Date
}

/** Same day `months` on, clamped to the month's end (Feb 29 becomes Feb 28). */
function plusMonths(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, last))
  return target.toISOString().slice(0, 10)
}

const uid = (...parts: string[]) => `${parts.join('-')}@${COMPLIANCE_ICS_DOMAIN}`

/** Deadlines across the whole window: today's set plus the set a year on (next filing year). */
function windowDeadlines(state: ReturnType<typeof complianceState>, today: string, end: string): ComplianceDeadline[] {
  const byCode = new Map<string, ComplianceDeadline>()
  for (const at of [today, end]) {
    for (const d of deadlinesForState(state, at)) if (!byCode.has(d.code)) byCode.set(d.code, d)
  }
  return [...byCode.values()]
}

export function complianceCalendarEvents(input: ComplianceCalendarInput): IcsEvent[] {
  const { orgId, today } = input
  const end = plusMonths(today, COMPLIANCE_ICS_MONTHS)
  const inWindow = (day: string | null): day is string => day !== null && day >= today && day <= end
  const multiple = input.associations.length > 1
  const events: IcsEvent[] = []

  for (const a of input.associations) {
    const name = a.name?.trim() || 'Your association'
    const state = complianceState(a.governingLawState, a.state)
    for (const d of windowDeadlines(state, today, end)) {
      if (!inWindow(d.dueOn)) continue
      const opens = d.opensOn && d.dueKind === 'filing' ? ` The filing window opens ${d.opensOn}.` : ''
      events.push({
        uid: uid(orgId, a.id, d.code, d.dueOn),
        summary: multiple ? `${d.title} (${name})` : d.title,
        date: d.dueOn,
        description: `${name}. ${d.citation}.${opens} Open Compliance in HomeownerHub for the steps. Check your governing documents and ask your association's attorney.`,
        url: d.officialUrl,
        now: input.now,
      })
    }
  }

  const known = new Map(input.associations.map((a) => [a.id, a.name?.trim() || 'Your association']))
  for (const p of input.policies) {
    if (!inWindow(p.expiresOn)) continue
    // A policy tied to an association this org doesn't list is not ours to show.
    if (p.associationId !== null && !known.has(p.associationId)) continue
    const where = p.associationId ? known.get(p.associationId)! : null
    events.push({
      uid: uid(orgId, 'insurance', p.id, p.expiresOn),
      summary: `Insurance renewal: ${POLICY_KIND_LABELS[p.kind]}`,
      date: p.expiresOn,
      description: `${where ? `${where}. ` : ''}This policy expires today. Open Insurance in HomeownerHub to review the renewal.`,
      now: input.now,
    })
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.uid.localeCompare(b.uid))
}

export function buildComplianceIcs(input: ComplianceCalendarInput): string {
  return buildIcsCalendar(complianceCalendarEvents(input), { prodId: COMPLIANCE_ICS_PRODID })
}
