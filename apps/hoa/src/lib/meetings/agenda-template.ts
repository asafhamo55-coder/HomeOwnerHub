import { isGaCondo } from '@/lib/ga-condo/law'

/**
 * The standard board meeting agenda, as plain text in the format the agenda
 * field already holds (numbered lines, "-" under an item). Pure: the forms
 * pass in what the server loaded. It follows the usual order of a board
 * meeting; it is a starting point the secretary edits, not legal advice.
 */

export type AgendaMeetingType = 'regular' | 'special' | 'annual' | 'emergency'

export interface AgendaActionItem {
  title: string
  assignee?: string | null
  /** 'YYYY-MM-DD' */
  dueDate?: string | null
}

export interface StandardAgendaInput {
  meetingType: AgendaMeetingType | string | null | undefined
  state: string | null | undefined
  /** Listed under Old business. Pass [] to leave them out. */
  openActionItems?: readonly AgendaActionItem[]
  /** Georgia annual meeting only: adds the owners’ report line. */
  includeOwnersReport?: boolean
  /** Owner comments item (the meeting is open to owners). Default true. */
  includeOwnerComments?: boolean
  /** A Georgia condominium follows a different statute, so it never gets the HOA line. */
  associationType?: string | null
}

/** The agenda field holds 4000 characters; the list under Old business stops well short. */
export const MAX_AGENDA_ACTION_ITEMS = 15

export type InsertMode = 'replace' | 'append'

/** True when the owners’ report line applies: a Georgia HOA annual meeting. */
export function ownersReportApplies(
  input: Pick<StandardAgendaInput, 'meetingType' | 'state' | 'associationType'>,
): boolean {
  const state = (input.state ?? '').trim().toUpperCase()
  return state === 'GA' && input.meetingType === 'annual' && !isGaCondo(state, input.associationType ?? null)
}

function actionLine(item: AgendaActionItem): string {
  const extra = [item.assignee?.trim(), item.dueDate ? `due ${item.dueDate}` : ''].filter(Boolean)
  return `   - ${item.title.trim()}${extra.length ? ` (${extra.join(', ')})` : ''}`
}

export function buildStandardAgenda(input: StandardAgendaInput): string {
  const items: string[][] = [
    ['Call to order'],
    ['Confirm quorum'],
    ['Approve last meeting’s minutes'],
    ['Officer and treasurer reports'],
  ]
  if (input.includeOwnersReport && ownersReportApplies(input)) {
    // No statute cited: § 44-3-230(a) is the members' meeting NOTICE rule,
    // not a reporting duty, so citing it here would misattribute it.
    items.push(['Annual report to the owners'])
  }

  const old = ['Old business']
  const actions = (input.openActionItems ?? []).filter((a) => a.title.trim())
  for (const a of actions.slice(0, MAX_AGENDA_ACTION_ITEMS)) old.push(actionLine(a))
  if (actions.length > MAX_AGENDA_ACTION_ITEMS) {
    old.push(`   - and ${actions.length - MAX_AGENDA_ACTION_ITEMS} more open action items`)
  }
  items.push(old)

  items.push(['New business'])
  if (input.includeOwnerComments !== false) items.push(['Owner comments'])
  items.push(['Adjourn'])

  return items.map(([head, ...rest], i) => [`${i + 1}. ${head}`, ...rest].join('\n')).join('\n')
}

/** Put `agenda` into the field: replace what is there, or add it to the end after a blank line. */
export function applyAgenda(existing: string, agenda: string, mode: InsertMode): string {
  const current = existing.trim()
  if (mode === 'replace' || !current) return agenda
  return `${current}\n\n${agenda}`
}
