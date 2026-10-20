/**
 * How long a resident has been waiting for a reply (BL-101 A6).
 *
 * Derived, never stored: a thread is waiting when its newest message is
 * inbound (`last_direction = 'inbound'`) and it is not closed, and the wait
 * is measured from that message (`last_message_at`). No new column is
 * needed, and the clock restarts on every inbound message, which is the
 * same rule Front uses ("restart on next inbound"). It is approximate on
 * purpose; real first-response reporting is plan item B1.
 *
 * Thresholds come from `associations.compliance_settings.inbox_sla_hours`
 * (jsonb, so no migration): `{ "warn": 48, "overdue": 120 }`. Anything
 * missing or invalid falls back to the defaults.
 *
 * Pure and dependency-free on purpose: packages/jobs (the daily digest)
 * imports this file by relative path, the same way mailbox-sync imports
 * ingest.ts, so it must not use the `@/` alias.
 */

export interface InboxSlaHours {
  /** Amber after this many hours. */
  warn: number
  /** Red after this many hours. */
  overdue: number
}

export const DEFAULT_INBOX_SLA_HOURS: InboxSlaHours = { warn: 48, overdue: 120 }

const HOUR_MS = 60 * 60 * 1000

function positiveHours(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 24 * 365
    ? value
    : null
}

/**
 * Reads `inbox_sla_hours` out of an association's `compliance_settings`.
 * An `overdue` that is not later than `warn` is ignored rather than
 * producing a badge that skips amber entirely.
 */
export function readInboxSlaHours(complianceSettings: unknown): InboxSlaHours {
  if (!complianceSettings || typeof complianceSettings !== 'object') return DEFAULT_INBOX_SLA_HOURS
  const raw = (complianceSettings as Record<string, unknown>).inbox_sla_hours
  if (!raw || typeof raw !== 'object') return DEFAULT_INBOX_SLA_HOURS
  const warn = positiveHours((raw as Record<string, unknown>).warn) ?? DEFAULT_INBOX_SLA_HOURS.warn
  const overdueRaw = positiveHours((raw as Record<string, unknown>).overdue)
  const overdue =
    overdueRaw !== null && overdueRaw > warn
      ? overdueRaw
      : Math.max(DEFAULT_INBOX_SLA_HOURS.overdue, warn * 2)
  return { warn, overdue }
}

export type WaitingTone = 'normal' | 'warn' | 'overdue'

export interface WaitingInfo {
  hours: number
  /** "Waiting 3h", "Waiting 2d". */
  label: string
  tone: WaitingTone
}

export interface WaitingInput {
  status: string
  lastDirection: string | null
  lastMessageAt: string | null
}

/** True when the ball is in the board's court: newest message inbound, thread not closed. */
export function isAwaitingReply(thread: WaitingInput): boolean {
  return thread.status !== 'closed' && thread.lastDirection === 'inbound' && thread.lastMessageAt !== null
}

/**
 * The badge for one thread, or null when nobody is waiting on the board.
 * A NULL `last_direction` (a thread from before the direction backfill)
 * gets no badge: we cannot say how long, so we do not guess.
 */
export function waitingInfo(
  thread: WaitingInput,
  now: number,
  sla: InboxSlaHours = DEFAULT_INBOX_SLA_HOURS,
): WaitingInfo | null {
  if (!isAwaitingReply(thread)) return null
  const since = Date.parse(thread.lastMessageAt as string)
  if (!Number.isFinite(since)) return null
  const hours = Math.max(0, (now - since) / HOUR_MS)
  const label =
    hours < 1 ? 'Waiting <1h' : hours < 24 ? `Waiting ${Math.floor(hours)}h` : `Waiting ${Math.floor(hours / 24)}d`
  const tone: WaitingTone = hours >= sla.overdue ? 'overdue' : hours >= sla.warn ? 'warn' : 'normal'
  return { hours, label, tone }
}

/** ISO timestamp `hours` before `now` — the `last_message_at <` cutoff for "waiting more than N hours". */
export function waitingCutoffIso(now: number, hours: number): string {
  return new Date(now - hours * HOUR_MS).toISOString()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SettingsDb = { from: (table: string) => any }

/**
 * The org's thresholds, from its first association (by name, matching the
 * other compliance_settings readers). A failed read falls back to the
 * defaults, logged by code: a badge with default colours beats no inbox.
 */
export async function loadInboxSlaHours(db: SettingsDb, orgId: string): Promise<InboxSlaHours> {
  const { data, error } = (await db
    .from('associations')
    .select('compliance_settings')
    .eq('organization_id', orgId)
    .order('name', { ascending: true })
    .limit(1)) as { data: Array<{ compliance_settings: unknown }> | null; error: { code?: string } | null }
  if (error) {
    console.error('loadInboxSlaHours: associations read failed', { orgId, code: error.code })
    return DEFAULT_INBOX_SLA_HOURS
  }
  return readInboxSlaHours(data?.[0]?.compliance_settings)
}
