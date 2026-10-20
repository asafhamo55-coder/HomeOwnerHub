/**
 * BL-102 A8: the results page in one sentence, per home rather than per
 * recipient row, from the delivery data already on communication_recipients
 * (no migration).
 *
 *   - A home is one unit_id. Rows with no unit (board, outside contacts)
 *     each count as their own "home" for the headline but can never be
 *     followed up, because the follow-up audience is a list of unit ids.
 *   - "Reached" means an email or text reached the provider (sent or
 *     better). A portal row is not "delivered": it is only "in the portal".
 *   - "Opened" counts email rows only. Texts and portal rows can never be
 *     "opened", so they never make a home look like it ignored the message.
 *     Apple Mail Privacy Protection pre-opens mail, so opens are approximate.
 *
 * Pure. Nothing here logs.
 */

export interface ResultRow {
  unit_id: string | null
  channel: string
  delivery_status: string
  email?: string | null
  phone?: string | null
  id?: string
}

const OPENED = new Set(['opened', 'clicked', 'replied'])
const REACHED = new Set(['sent', 'delivered', 'opened', 'clicked', 'replied'])
const EXTERNAL = new Set(['email', 'sms'])

export interface HomeRollup {
  homes: number
  /** Homes an email or text reached. */
  reached: number
  /** Homes that only have the message in the portal. */
  portalOnly: number
  /** Homes that were emailed (email reached the provider). */
  emailed: number
  /** Homes that opened an email (approximate). */
  opened: number
  /** Unit ids of homes that were emailed and haven't opened it. */
  notOpenedUnitIds: string[]
  /** Homes where every email or text failed or bounced. */
  failed: number
}

function homeKey(r: ResultRow, i: number): string {
  return r.unit_id ?? `row:${r.id ?? r.email ?? r.phone ?? i}`
}

export function rollupByHome(rows: readonly ResultRow[]): HomeRollup {
  const byHome = new Map<string, { unitId: string | null; rows: ResultRow[] }>()
  rows.forEach((r, i) => {
    const k = homeKey(r, i)
    const e = byHome.get(k) ?? { unitId: r.unit_id, rows: [] }
    e.rows.push(r)
    byHome.set(k, e)
  })

  let reached = 0
  let portalOnly = 0
  let emailed = 0
  let opened = 0
  let failed = 0
  const notOpenedUnitIds: string[] = []
  for (const { unitId, rows: hr } of byHome.values()) {
    const external = hr.filter((r) => EXTERNAL.has(r.channel))
    const isReached = external.some((r) => REACHED.has(r.delivery_status))
    if (isReached) reached += 1
    else if (hr.some((r) => r.channel === 'portal' && REACHED.has(r.delivery_status))) portalOnly += 1
    if (external.length > 0 && !isReached && external.every((r) => r.delivery_status === 'failed' || r.delivery_status === 'bounced')) {
      failed += 1
    }
    const emails = hr.filter((r) => r.channel === 'email' && REACHED.has(r.delivery_status))
    if (emails.length > 0) {
      emailed += 1
      if (emails.some((r) => OPENED.has(r.delivery_status))) opened += 1
      else if (unitId) notOpenedUnitIds.push(unitId)
    }
  }
  return { homes: byHome.size, reached, portalOnly, emailed, opened, notOpenedUnitIds, failed }
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** "Reached 46 of 50 homes. 31 opened the email (approximate)." */
export function resultsHeadline(r: HomeRollup): string {
  const parts = [`Reached ${r.reached} of ${plural(r.homes, 'home', 'homes')} by email or text.`]
  if (r.portalOnly > 0) parts.push(`${plural(r.portalOnly, 'more home has', 'more homes have')} it only in the portal.`)
  if (r.emailed > 0) {
    parts.push(`${r.opened} of ${r.emailed} emailed ${r.emailed === 1 ? 'home' : 'homes'} opened it (approximate).`)
  }
  if (r.failed > 0) parts.push(`${plural(r.failed, 'home', 'homes')} couldn’t be reached.`)
  return parts.join(' ')
}

/**
 * Original audiences a follow-up can target as the same people. A follow-up
 * goes to `specific_units`, which picks each unit's owner (or its renter
 * when no owner is on file) — the same person these audiences picked.
 * Renters-only, hand-picked people, the board and outside contacts would
 * reach someone different, so they get no follow-up button.
 */
const FOLLOW_UP_KINDS = new Set(['everyone', 'owners_only', 'late_on_dues', 'open_violations', 'specific_units'])

export interface FollowUpAudience {
  unitIds: string[]
  ownersOnly: boolean
}

export function followUpAudience(audienceDefinition: unknown, rollup: HomeRollup): FollowUpAudience | null {
  if (rollup.notOpenedUnitIds.length === 0) return null
  const def = (audienceDefinition && typeof audienceDefinition === 'object' ? audienceDefinition : {}) as {
    kind?: unknown
    ownersOnly?: unknown
  }
  const kind = typeof def.kind === 'string' ? def.kind : ''
  if (!FOLLOW_UP_KINDS.has(kind)) return null
  return {
    unitIds: rollup.notOpenedUnitIds,
    ownersOnly: kind === 'owners_only' || (kind === 'specific_units' && def.ownersOnly === true),
  }
}

/** "Reminder: Water off Thursday", never "Reminder: Reminder: …". */
export function reminderSubject(subject: string): string {
  const trimmed = subject.trim().replace(/^(reminder:\s*)+/i, '')
  return `Reminder: ${trimmed}`.slice(0, 255)
}
