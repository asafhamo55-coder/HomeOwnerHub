import { createAdminClient } from '@homeowner-portal/db'
import { fetchOrgSandbox } from '@homeowner-portal/observability/outbound-guard'
import { inngest } from './client'
// Dependency-free (no imports of its own), shared with the inbox list so the
// digest's "waiting" means exactly what the badge means. Same relative-path
// pattern as mailbox-attachments.ts -> attachment-state.ts.
import { loadInboxSlaHours, waitingCutoffIso } from '../../../apps/hoa/src/lib/inbox/waiting'
// BL-113: the ARC decision clock. Same dependency-free, relative-path rule.
import {
  ARC_DEEMED_APPROVAL_NOTE,
  ARC_DIGEST_DUE_DAYS,
  ARC_OPEN_STATUSES,
  arcClockSecret,
  arcDigestCounts,
  pickArcClockSettings,
  readArcClockSettings,
} from '../../../apps/hoa/src/lib/arc-review/clock'
// BL-119: the board task list's rules. Same dependency-free, relative-path rule.
import {
  TASK_OPEN_STATUSES,
  TASK_WEEK_DAYS,
  taskDigestCountsByAssignee,
  weekEnd,
} from '../../../apps/hoa/src/lib/tasks/model'
import { DEFAULT_ASSOCIATION_TIME_ZONE, todayIn } from './association-time'
// BL-123 (3): owner records-request deadlines. Same dependency-free,
// relative-path rule; inert until RECORDS_REQUESTS_LIVE (migration 0066).
import { RECORDS_REQUESTS_LIVE } from '@homeowner-portal/db/records-requests'
import {
  RECORDS_CATEGORY,
  RECORDS_DUE_SOON_DAYS,
  recordsDigestCounts,
} from '../../../apps/hoa/src/lib/records-requests/law'

/**
 * Morning health check across every active HOA org, 7am Eastern.
 *
 * This used to also pre-generate the Daily Digest. It no longer does. The
 * digest's numbers are now computed in SQL at render time
 * (apps/hoa/src/lib/dashboard/digest-facts.ts) and its one AI line is a
 * "start with X" suggestion that names a specific thread — pre-generating
 * that at 7am means directing a board member at a thread they may have
 * answered at 9am, which is worse than no suggestion at all. The dashboard
 * card refreshes the line itself once a day on first visit, so nothing is
 * lost by dropping it here.
 *
 * What remains is the part that genuinely needs a schedule: surfacing a
 * mailbox that has stopped syncing. A board that believes email is flowing
 * while it isn't loses trust in the product permanently, and nobody is
 * watching sync_status on their own.
 *
 * BL-003: that used to stop at a log line, which never reaches a board that
 * isn't logged in. Now each board member (org_members role board/admin —
 * never a resident) gets a "Mailbox disconnected since <date> — reconnect"
 * email linking to /settings/mailbox, every morning the condition holds.
 *
 * Sending is injected (`DailyDigestDeps.sendEmail`) because the email
 * transport lives in apps/hoa, which depends on this package, not the other
 * way round. The HOA app passes its `sendEmail`, which runs every recipient
 * through the outbound safety guard (BL-004); this job also hands it the
 * org's sandbox flag. Logs carry org/mailbox ids and counts only.
 *
 * BL-101 A6: the same morning email also says how many residents have been
 * waiting longer than the org's warn threshold (48h by default) for a
 * reply, and how many of those are assigned to the recipient. Counts only,
 * no subjects or names, and board members only; residents get nothing. A
 * board with nothing waiting and a healthy mailbox gets no email at all.
 *
 * BL-113: and how many ARC applications are past the board's "decide
 * within N days" deadline or due within 3 days, linking to /arc. Counts
 * only, board members only.
 *
 * BL-119: and the recipient's OWN tasks (meeting action items assigned to
 * them) that are overdue or due within 7 days, linking to /tasks. Each
 * member sees only their own counts; a board member with tasks due gets
 * the email even when nothing else is wrong. Counts only.
 *
 * BL-123 (3): and how many owner records requests are past their statutory
 * due day or due within 3 days, linking to /tickets/records. Counts only,
 * board members only, and only once RECORDS_REQUESTS_LIVE is on (before
 * that the tickets table is not even queried for them).
 *
 * The Inngest function id stays 'daily-digest' deliberately. Changing an
 * id registers a NEW function and leaves the old one scheduled, so the
 * rename would have to be coordinated with a deploy that unregisters the
 * old id — not worth it for a cosmetic name.
 */

/** Roles that receive the alert. A resident is never one of them. */
export const BOARD_ROLES = ['board', 'admin'] as const

export interface DigestEmail {
  to: string
  subject: string
  html: string
  text: string
}

export interface DailyDigestDeps {
  /** A guarded sender — in production, apps/hoa's `sendEmail`. */
  sendEmail: (
    input: DigestEmail,
    opts: { orgSandbox?: boolean; ref?: string },
  ) => Promise<{ ok: boolean }>
  /** Absolute URL for an app path, e.g. appUrl('/settings/mailbox'). */
  appUrl: (path: string) => string
}

export interface BrokenMailbox {
  id: string
  email_address: string
  sync_status: string
  last_synced_at: string | null
  connected_at: string
}

interface DigestLogger {
  info: (msg: string, ...rest: unknown[]) => void
  warn: (msg: string, ...rest: unknown[]) => void
  error: (msg: string, ...rest: unknown[]) => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export interface DailyDigestResult {
  processed: number
  brokenMailboxes: number
  /** Threads waiting past the warn threshold, summed across orgs. */
  waitingThreads: number
  /** ARC applications past their decision deadline, summed across orgs (BL-113). */
  arcOverdue: number
  /** ARC applications due within ARC_DIGEST_DUE_DAYS, summed across orgs. */
  arcDueSoon: number
  /** Assigned open tasks past their due date, summed across orgs (BL-119). */
  tasksOverdue: number
  /** Assigned open tasks due within TASK_WEEK_DAYS, summed across orgs. */
  tasksDueSoon: number
  /** Open records requests past their due day, summed across orgs (BL-123). 0 while the flag is off. */
  recordsOverdue: number
  /** Open records requests due within RECORDS_DUE_SOON_DAYS, summed across orgs. */
  recordsDueSoon: number
  emailed: number
  failed: number
}

// ─── Message ────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** "Oct 12, 2026" in the job's own time zone (the cron runs on ET). */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  }).format(new Date(iso))
}

/**
 * When the mailbox stopped working, as best we know: its last successful
 * sync, or — if it never synced — when it was connected.
 */
function brokenSince(m: BrokenMailbox): string {
  return m.last_synced_at ?? m.connected_at
}

function whatHappened(status: string): string {
  return status === 'auth_failed'
    ? 'Google stopped accepting our connection to this mailbox, so new resident email is not reaching HomeownerHub.'
    : 'Syncing has stopped for this mailbox, so new resident email is not reaching HomeownerHub.'
}

export function buildMailboxAlert(args: {
  orgName: string
  mailboxes: BrokenMailbox[]
  reconnectUrl: string
}): { subject: string; html: string; text: string } {
  const { orgName, mailboxes, reconnectUrl } = args
  const subject = `Action needed: ${orgName}'s mailbox is disconnected`

  const textBlocks = mailboxes.map((m) =>
    [
      `Mailbox disconnected since ${formatDate(brokenSince(m))} — reconnect`,
      `${m.email_address}: ${whatHappened(m.sync_status)}`,
      `Reconnect it here (takes about a minute): ${reconnectUrl}`,
    ].join('\n'),
  )
  const text = [
    `Good morning. This is your daily check from HomeownerHub for ${orgName}.`,
    '',
    ...textBlocks.flatMap((b) => [b, '']),
    'Until it is reconnected, replies and new messages from residents will not appear in your Inbox.',
  ].join('\n')

  const htmlBlocks = mailboxes
    .map(
      (m) => `
  <div style="border:1px solid #e5e7eb;border-left:4px solid #b45309;border-radius:6px;padding:16px;margin:16px 0">
    <p style="margin:0 0 8px;font-weight:600">Mailbox disconnected since ${escapeHtml(formatDate(brokenSince(m)))} — reconnect</p>
    <p style="margin:0 0 12px">${escapeHtml(m.email_address)}: ${escapeHtml(whatHappened(m.sync_status))}</p>
    <a href="${escapeHtml(reconnectUrl)}" style="display:inline-block;padding:8px 14px;border-radius:6px;background:#111827;color:#ffffff;text-decoration:none">Reconnect mailbox</a>
  </div>`,
    )
    .join('')
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.5;color:#111827">
  <p>Good morning. This is your daily check from HomeownerHub for ${escapeHtml(orgName)}.</p>${htmlBlocks}
  <p>Until it is reconnected, replies and new messages from residents will not appear in your Inbox.</p>
</div>`

  return { subject, html, text }
}

// ─── Waiting residents (BL-101 A6) ─────────────────────────────────

export interface WaitingSummary {
  /** The org's warn threshold, in hours. */
  hours: number
  /** Thread ids and assignees only, never subjects or senders. */
  threads: Array<{ id: string; assigned_to: string | null }>
}

/**
 * Threads waiting on the board for longer than the warn threshold: newest
 * message inbound, not closed, still in the Gmail inbox, last message
 * older than the cutoff. The same rule as the inbox's waiting badge
 * (apps/hoa/src/lib/inbox/waiting.ts). Returns null on a failed read
 * (logged by code) so a failure never reads as "nobody is waiting".
 */
export async function loadWaitingThreads(
  db: Db,
  orgId: string,
  now: number,
  logger: DigestLogger,
): Promise<WaitingSummary | null> {
  const { warn } = await loadInboxSlaHours(db, orgId)
  const { data, error } = await db
    .from('inbox_threads')
    .select('id, assigned_to')
    .eq('organization_id', orgId)
    .eq('last_direction', 'inbound')
    .neq('status', 'closed')
    .not('gmail_state', 'in', '("archived","trashed")')
    .lt('last_message_at', waitingCutoffIso(now, warn))
  if (error) {
    logger.error(`[daily-digest] ${orgId}: failed to count waiting threads`, { code: error.code })
    return null
  }
  return { hours: warn, threads: (data ?? []) as WaitingSummary['threads'] }
}

/** The waiting block for one recipient. `mine` is how many of them are assigned to that person. */
export function buildWaitingBlock(args: {
  total: number
  mine: number
  hours: number
  inboxUrl: string
}): { line: string; text: string; html: string } {
  const { total, mine, hours, inboxUrl } = args
  const who = total === 1 ? '1 resident' : `${total} residents`
  const line = `${who} waiting more than ${Math.round(hours)}h (${mine} assigned to you)`
  const text = [line, `Open the Inbox: ${inboxUrl}`].join('\n')
  const html = `
  <div style="border:1px solid #e5e7eb;border-left:4px solid #b45309;border-radius:6px;padding:16px;margin:16px 0">
    <p style="margin:0 0 12px;font-weight:600">${escapeHtml(line)}</p>
    <a href="${escapeHtml(inboxUrl)}" style="display:inline-block;padding:8px 14px;border-radius:6px;background:#111827;color:#ffffff;text-decoration:none">Open the Inbox</a>
  </div>`
  return { line, text, html }
}

// ─── ARC decision clock (BL-113) ───────────────────────────────────

export interface ArcDigestSummary {
  overdue: number
  dueSoon: number
}

/**
 * Open ARC applications (submitted / in review) for one org, timed against
 * each association's signed "decide within N days" setting (default 30
 * calendar days). Returns null on a failed read (logged by code) so a
 * failure never reads as "nothing is due".
 */
export async function loadArcDeadlines(
  db: Db,
  orgId: string,
  now: number,
  logger: DigestLogger,
  secret: string | null = arcClockSecret(),
): Promise<ArcDigestSummary | null> {
  const { data: assocs, error: assocError } = await db
    .from('associations')
    .select('id, compliance_settings')
    .eq('organization_id', orgId)
  if (assocError) {
    logger.error(`[daily-digest] ${orgId}: failed to load ARC deadline settings`, { code: assocError.code })
    return null
  }
  const byAssociation = ((assocs ?? []) as Array<{ id?: string; compliance_settings: unknown }>)
    .filter((a): a is { id: string; compliance_settings: unknown } => typeof a.id === 'string')
    .map((a) => {
      const read = readArcClockSettings(a.id, a.compliance_settings, secret)
      return { associationId: a.id, settings: { days: read.days, dayKind: read.dayKind } }
    })

  const { data, error } = await db
    .from('arc_requests')
    .select('id, association_id, status, submitted_at')
    .eq('organization_id', orgId)
    .in('status', [...ARC_OPEN_STATUSES])
    .is('deleted_at', null)
  if (error) {
    logger.error(`[daily-digest] ${orgId}: failed to load open ARC applications`, { code: error.code })
    return null
  }
  const rows = (data ?? []) as Array<{ association_id: string | null; status: string; submitted_at: string }>
  return arcDigestCounts(
    rows.map((r) => ({
      status: r.status,
      submittedAt: r.submitted_at,
      settings: pickArcClockSettings(byAssociation, r.association_id),
    })),
    now,
  )
}

function arcCount(n: number): string {
  return n === 1 ? '1 ARC application' : `${n} ARC applications`
}

/** The ARC block: overdue and due-soon lines, the deemed-approval note, a link to /arc. */
export function buildArcBlock(args: { overdue: number; dueSoon: number; arcUrl: string }): {
  lines: string[]
  text: string
  html: string
} {
  const lines: string[] = []
  if (args.overdue > 0) lines.push(`${arcCount(args.overdue)} past the board's decision deadline`)
  if (args.dueSoon > 0) lines.push(`${arcCount(args.dueSoon)} due for a decision within ${ARC_DIGEST_DUE_DAYS} days`)
  const note = args.overdue > 0 ? ARC_DEEMED_APPROVAL_NOTE : null
  const text = [...lines, ...(note ? [note] : []), `Open ARC review: ${args.arcUrl}`].join('\n')
  const border = args.overdue > 0 ? '#b91c1c' : '#b45309'
  const html = `
  <div style="border:1px solid #e5e7eb;border-left:4px solid ${border};border-radius:6px;padding:16px;margin:16px 0">
    ${lines.map((l) => `<p style="margin:0 0 8px;font-weight:600">${escapeHtml(l)}</p>`).join('')}
    ${note ? `<p style="margin:0 0 12px">${escapeHtml(note)}</p>` : ''}
    <a href="${escapeHtml(args.arcUrl)}" style="display:inline-block;padding:8px 14px;border-radius:6px;background:#111827;color:#ffffff;text-decoration:none">Open ARC review</a>
  </div>`
  return { lines, text, html }
}

// ─── Board tasks (BL-119) ──────────────────────────────────────────

/** Per assignee (profiles id): their own overdue and due-this-week task counts. */
export type TaskDigestSummary = Map<string, { overdue: number; dueSoon: number }>

/**
 * Open meeting action items for one org that have an in-app assignee and a
 * due date no later than the end of this week. Returns null on a failed read
 * (logged by code) so a failure never reads as "nothing is due".
 */
export async function loadTaskDeadlines(
  db: Db,
  orgId: string,
  today: string,
  logger: DigestLogger,
): Promise<TaskDigestSummary | null> {
  const { data, error } = await db
    .from('meeting_action_items')
    .select('assignee_user_id, status, due_date')
    .eq('org_id', orgId)
    .in('status', [...TASK_OPEN_STATUSES])
    .not('assignee_user_id', 'is', null)
    .lte('due_date', weekEnd(today))
  if (error) {
    logger.error(`[daily-digest] ${orgId}: failed to load task deadlines`, { code: error.code })
    return null
  }
  return taskDigestCountsByAssignee(
    (data ?? []) as Array<{ assignee_user_id: string | null; status: string; due_date: string | null }>,
    today,
  )
}

function taskCount(n: number): string {
  return n === 1 ? '1 of your tasks' : `${n} of your tasks`
}

/** The tasks block: the recipient's own overdue and due-this-week lines, a link to /tasks. */
export function buildTaskBlock(args: { overdue: number; dueSoon: number; tasksUrl: string }): {
  lines: string[]
  text: string
  html: string
} {
  const lines: string[] = []
  if (args.overdue > 0) lines.push(`${taskCount(args.overdue)} ${args.overdue === 1 ? 'is' : 'are'} overdue`)
  if (args.dueSoon > 0) lines.push(`${taskCount(args.dueSoon)} ${args.dueSoon === 1 ? 'is' : 'are'} due within ${TASK_WEEK_DAYS} days`)
  const text = [...lines, `Open your tasks: ${args.tasksUrl}`].join('\n')
  const border = args.overdue > 0 ? '#b91c1c' : '#b45309'
  const html = `
  <div style="border:1px solid #e5e7eb;border-left:4px solid ${border};border-radius:6px;padding:16px;margin:16px 0">
    ${lines.map((l) => `<p style="margin:0 0 8px;font-weight:600">${escapeHtml(l)}</p>`).join('')}
    <a href="${escapeHtml(args.tasksUrl)}" style="display:inline-block;padding:8px 14px;border-radius:6px;background:#111827;color:#ffffff;text-decoration:none">Open your tasks</a>
  </div>`
  return { lines, text, html }
}

// ─── Owner records requests (BL-123 item 3) ────────────────────────

export interface RecordsDigestSummary {
  overdue: number
  dueSoon: number
}

/**
 * Open records requests for one org with a statutory due day
 * (tickets.records_due_at). null on a failed read (logged by code), and
 * null without a query while RECORDS_REQUESTS_LIVE is off.
 */
export async function loadRecordsDeadlines(
  db: Db,
  orgId: string,
  today: string,
  logger: DigestLogger,
  live: boolean = RECORDS_REQUESTS_LIVE,
): Promise<RecordsDigestSummary | null> {
  if (!live) return null
  const { data, error } = await db
    .from('tickets')
    .select('status, records_due_at')
    .eq('organization_id', orgId)
    .eq('category', RECORDS_CATEGORY)
    .in('status', ['open', 'in_progress'])
    .is('deleted_at', null)
    .not('records_due_at', 'is', null)
  if (error) {
    logger.error(`[daily-digest] ${orgId}: failed to load records-request deadlines`, { code: error.code })
    return null
  }
  return recordsDigestCounts((data ?? []) as Array<{ status: string; records_due_at: string | null }>, today)
}

function recordsCount(n: number): string {
  return n === 1 ? '1 owner records request' : `${n} owner records requests`
}

/** The records block: overdue and due-soon lines, a link to /tickets/records. */
export function buildRecordsBlock(args: { overdue: number; dueSoon: number; recordsUrl: string }): {
  lines: string[]
  text: string
  html: string
} {
  const lines: string[] = []
  if (args.overdue > 0) lines.push(`${recordsCount(args.overdue)} past the statutory deadline`)
  if (args.dueSoon > 0) lines.push(`${recordsCount(args.dueSoon)} due within ${RECORDS_DUE_SOON_DAYS} days`)
  const text = [...lines, `Open records requests: ${args.recordsUrl}`].join('\n')
  const border = args.overdue > 0 ? '#b91c1c' : '#b45309'
  const html = `
  <div style="border:1px solid #e5e7eb;border-left:4px solid ${border};border-radius:6px;padding:16px;margin:16px 0">
    ${lines.map((l) => `<p style="margin:0 0 8px;font-weight:600">${escapeHtml(l)}</p>`).join('')}
    <a href="${escapeHtml(args.recordsUrl)}" style="display:inline-block;padding:8px 14px;border-radius:6px;background:#111827;color:#ffffff;text-decoration:none">Open records requests</a>
  </div>`
  return { lines, text, html }
}

/**
 * One recipient's morning email: the mailbox alert when a mailbox is
 * broken, the waiting block when residents are waiting, or both.
 */
export function buildDigestEmail(args: {
  orgName: string
  mailboxes: BrokenMailbox[]
  reconnectUrl: string
  waiting: { total: number; mine: number; hours: number; inboxUrl: string } | null
  /** BL-113: ARC deadlines. Omitted or all-zero adds nothing. */
  arc?: { overdue: number; dueSoon: number; arcUrl: string } | null
  /** BL-119: the recipient's own task deadlines. Omitted or all-zero adds nothing. */
  tasks?: { overdue: number; dueSoon: number; tasksUrl: string } | null
  /** BL-123 (3): records-request deadlines. Omitted or all-zero adds nothing. */
  records?: { overdue: number; dueSoon: number; recordsUrl: string } | null
}): { subject: string; html: string; text: string } {
  const block = args.waiting && args.waiting.total > 0 ? buildWaitingBlock(args.waiting) : null
  const arcBlock = args.arc && (args.arc.overdue > 0 || args.arc.dueSoon > 0) ? buildArcBlock(args.arc) : null
  const extras: Array<{ text: string; html: string }> = []
  if (block) extras.push(block)
  if (arcBlock) extras.push(arcBlock)
  const taskBlock =
    args.tasks && (args.tasks.overdue > 0 || args.tasks.dueSoon > 0) ? buildTaskBlock(args.tasks) : null
  if (taskBlock) extras.push(taskBlock)
  const recordsBlock =
    args.records && (args.records.overdue > 0 || args.records.dueSoon > 0) ? buildRecordsBlock(args.records) : null
  if (recordsBlock) extras.push(recordsBlock)
  if (args.mailboxes.length > 0) {
    const alert = buildMailboxAlert(args)
    if (extras.length === 0) return alert
    return {
      subject: alert.subject,
      text: [alert.text, ...extras.map((b) => b.text)].join('\n\n'),
      html: alert.html.replace(/<\/div>\s*$/, `${extras.map((b) => b.html).join('')}\n</div>`),
    }
  }
  const who = args.waiting && args.waiting.total === 1 ? '1 resident' : `${args.waiting?.total ?? 0} residents`
  const text = [
    `Good morning. This is your daily check from HomeownerHub for ${args.orgName}.`,
    '',
    extras.map((b) => b.text).join('\n\n'),
  ].join('\n')
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.5;color:#111827">
  <p>Good morning. This is your daily check from HomeownerHub for ${escapeHtml(args.orgName)}.</p>${extras.map((b) => b.html).join('')}
</div>`
  const subject = block
    ? `${who} waiting for a reply — ${args.orgName}`
    : !arcBlock && !taskBlock && recordsBlock
      ? args.records!.overdue > 0
        ? `${recordsCount(args.records!.overdue)} past the statutory deadline — ${args.orgName}`
        : `${recordsCount(args.records!.dueSoon)} due soon — ${args.orgName}`
    : !arcBlock && taskBlock
      ? args.tasks!.overdue > 0
        ? `${taskCount(args.tasks!.overdue)} overdue — ${args.orgName}`
        : `${taskCount(args.tasks!.dueSoon)} due this week — ${args.orgName}`
      : args.arc && args.arc.overdue > 0
        ? `${arcCount(args.arc.overdue)} past the decision deadline — ${args.orgName}`
        : `${arcCount(args.arc?.dueSoon ?? 0)} due for a decision soon — ${args.orgName}`
  return { subject, html, text }
}

// ─── Recipients ─────────────────────────────────────────────────────

/** One board/admin member who can be emailed. */
export interface BoardRecipient {
  userId: string
  email: string
}

/** Why `loadBoardRecipients` could not answer. Carries the query's code only. */
export class BoardRecipientsError extends Error {
  constructor(
    readonly stage: 'members' | 'profiles',
    readonly code: string | undefined,
  ) {
    super(`board recipients: ${stage} read failed (${code ?? 'no code'})`)
    this.name = 'BoardRecipientsError'
  }
}

/**
 * Board/admin members of one org with an email address, one per address.
 * Never residents. THROWS `BoardRecipientsError` on a failed read, so a
 * caller cannot mistake "couldn't look" for "nobody to tell".
 *
 * The recipient rule for every board-facing email (this alert and the
 * month-end board report, BL-073): org_members role in BOARD_ROLES →
 * profiles.email.
 */
export async function loadBoardRecipients(db: Db, orgId: string): Promise<BoardRecipient[]> {
  const { data: members, error } = await db
    .from('org_members')
    .select('user_id, role')
    .eq('org_id', orgId)
    .in('role', [...BOARD_ROLES])
  if (error) throw new BoardRecipientsError('members', error.code)

  // Re-checked in code: the role filter above is the query's job, but the
  // promise that a resident is never emailed should not rest on one
  // `.in(...)` call surviving every future edit.
  const allowedRoles: readonly string[] = BOARD_ROLES
  const userIds = ((members ?? []) as { user_id: string | null; role: string }[])
    .filter((m) => m.user_id && allowedRoles.includes(m.role))
    .map((m) => m.user_id as string)
  if (userIds.length === 0) return []

  const { data: profiles, error: profileError } = await db
    .from('profiles')
    .select('id, email')
    .in('id', userIds)
  if (profileError) throw new BoardRecipientsError('profiles', profileError.code)

  const wanted = new Set(userIds)
  const seen = new Set<string>()
  const out: BoardRecipient[] = []
  for (const p of (profiles ?? []) as { id: string; email: string | null }[]) {
    if (!wanted.has(p.id) || !p.email) continue
    const email = p.email.trim()
    if (!email || seen.has(email)) continue
    seen.add(email)
    out.push({ userId: p.id, email })
  }
  return out
}

/** Board/admin recipients for one org. Never residents. [] (logged) on a failed read. */
async function boardRecipients(db: Db, orgId: string, logger: DigestLogger): Promise<BoardRecipient[]> {
  try {
    return await loadBoardRecipients(db, orgId)
  } catch (err) {
    if (!(err instanceof BoardRecipientsError)) throw err
    const what = err.stage === 'members' ? 'board members' : 'board profiles'
    logger.error(`[daily-digest] ${orgId}: failed to load ${what}`, { code: err.code })
    return []
  }
}

// ─── Job ────────────────────────────────────────────────────────────

export async function runDailyDigest(
  db: Db,
  deps: DailyDigestDeps,
  logger: DigestLogger,
): Promise<DailyDigestResult> {
  const { data: orgs, error } = await db
    .from('orgs')
    .select('id, name')
    .eq('hub_type', 'hoa')
    .neq('plan', 'free')

  if (error) {
    logger.error('[daily-digest] failed to load orgs', { code: error.code, message: error.message })
    throw new Error(error.message)
  }

  let brokenTotal = 0
  let waitingTotal = 0
  let arcOverdueTotal = 0
  let arcDueSoonTotal = 0
  let tasksOverdueTotal = 0
  let tasksDueSoonTotal = 0
  let recordsOverdueTotal = 0
  let recordsDueSoonTotal = 0
  let emailed = 0
  let failed = 0
  const now = Date.now()

  for (const org of (orgs ?? []) as { id: string; name: string | null }[]) {
    const orgId = org.id

    const { data: brokenMailboxes, error: brokenMailboxesError } = await db
      .from('mailbox_accounts')
      .select('id, email_address, sync_status, last_synced_at, connected_at')
      .eq('organization_id', orgId)
      .is('disconnected_at', null)
      .in('sync_status', ['stalled', 'auth_failed'])

    if (brokenMailboxesError) {
      // A failed check here must not read as "nothing is broken" — log
      // it (message/code only; PostgrestError.details can carry row
      // values). The waiting reminder below still runs: it does not
      // depend on this read.
      logger.error(`[daily-digest] ${orgId}: failed to check mailbox sync status`, {
        code: brokenMailboxesError.code,
        message: brokenMailboxesError.message,
      })
    }

    const broken = (brokenMailboxesError ? [] : (brokenMailboxes ?? [])) as BrokenMailbox[]

    let waiting: WaitingSummary | null = null
    try {
      waiting = await loadWaitingThreads(db, orgId, now, logger)
    } catch (err) {
      logger.error(`[daily-digest] ${orgId}: waiting-thread check failed`, {
        message: err instanceof Error ? err.name : 'unknown',
      })
    }
    const waitingCount = waiting?.threads.length ?? 0
    waitingTotal += waitingCount

    let arc: ArcDigestSummary | null = null
    try {
      arc = await loadArcDeadlines(db, orgId, now, logger)
    } catch (err) {
      logger.error(`[daily-digest] ${orgId}: ARC deadline check failed`, {
        message: err instanceof Error ? err.name : 'unknown',
      })
    }
    const arcOverdue = arc?.overdue ?? 0
    const arcDueSoon = arc?.dueSoon ?? 0
    arcOverdueTotal += arcOverdue
    arcDueSoonTotal += arcDueSoon

    // BL-119: each recipient's own tasks. Day granularity in the job's zone
    // (the cron runs 7am Eastern).
    let tasks: TaskDigestSummary | null = null
    try {
      tasks = await loadTaskDeadlines(db, orgId, todayIn(DEFAULT_ASSOCIATION_TIME_ZONE, new Date(now)), logger)
    } catch (err) {
      logger.error(`[daily-digest] ${orgId}: task deadline check failed`, {
        message: err instanceof Error ? err.name : 'unknown',
      })
    }
    let orgTasksOverdue = 0
    let orgTasksDueSoon = 0
    for (const c of tasks?.values() ?? []) {
      orgTasksOverdue += c.overdue
      orgTasksDueSoon += c.dueSoon
    }
    tasksOverdueTotal += orgTasksOverdue
    tasksDueSoonTotal += orgTasksDueSoon

    // BL-123 (3): no query at all while RECORDS_REQUESTS_LIVE is off.
    let records: RecordsDigestSummary | null = null
    try {
      records = await loadRecordsDeadlines(db, orgId, todayIn(DEFAULT_ASSOCIATION_TIME_ZONE, new Date(now)), logger)
    } catch (err) {
      logger.error(`[daily-digest] ${orgId}: records-request deadline check failed`, {
        message: err instanceof Error ? err.name : 'unknown',
      })
    }
    const recordsOverdue = records?.overdue ?? 0
    const recordsDueSoon = records?.dueSoon ?? 0
    recordsOverdueTotal += recordsOverdue
    recordsDueSoonTotal += recordsDueSoon

    const orgWide =
      broken.length > 0 || waitingCount > 0 || arcOverdue > 0 || arcDueSoon > 0 || recordsOverdue > 0 || recordsDueSoon > 0

    if (!orgWide && orgTasksOverdue === 0 && orgTasksDueSoon === 0) continue
    if (orgTasksOverdue > 0 || orgTasksDueSoon > 0) {
      // Counts only, never which task or whose.
      logger.info(`[daily-digest] ${orgId}: ${orgTasksOverdue} task(s) overdue, ${orgTasksDueSoon} due this week`)
    }
    if (waitingCount > 0) {
      // A count, never which residents.
      logger.info(`[daily-digest] ${orgId}: ${waitingCount} thread(s) waiting past the threshold`)
    }
    if (arcOverdue > 0 || arcDueSoon > 0) {
      // Counts only, never which application or who submitted it.
      logger.info(`[daily-digest] ${orgId}: ${arcOverdue} ARC overdue, ${arcDueSoon} ARC due soon`)
    }
    if (recordsOverdue > 0 || recordsDueSoon > 0) {
      // Counts only, never which request or who asked.
      logger.info(`[daily-digest] ${orgId}: ${recordsOverdue} records request(s) overdue, ${recordsDueSoon} due soon`)
    }

    for (const mailbox of broken) {
      brokenTotal += 1
      // Ids and status only: the address and sync_error stay out of logs.
      logger.error(`[daily-digest] ${orgId}: mailbox ${mailbox.id} is ${mailbox.sync_status}`)
    }

    try {
      const recipients = await boardRecipients(db, orgId, logger)
      if (recipients.length === 0) {
        logger.warn(`[daily-digest] ${orgId}: no board member with an email to alert`)
        continue
      }

      const outbound = { orgSandbox: await fetchOrgSandbox(db, orgId), ref: orgId }

      let orgSent = 0
      let orgFailed = 0
      for (const { userId, email: to } of recipients) {
        // BL-119: a member's tasks go to that member only. With nothing
        // org-wide to report, a member with no tasks due gets no email.
        const mine = tasks?.get(userId) ?? null
        const mineDue = mine != null && (mine.overdue > 0 || mine.dueSoon > 0)
        if (!orgWide && !mineDue) continue
        // Per recipient: "M assigned to you" differs by person.
        const alert = buildDigestEmail({
          orgName: org.name ?? 'your community',
          mailboxes: broken,
          reconnectUrl: deps.appUrl('/settings/mailbox'),
          waiting:
            waiting && waitingCount > 0
              ? {
                  total: waitingCount,
                  mine: waiting.threads.filter((t) => t.assigned_to === userId).length,
                  hours: waiting.hours,
                  inboxUrl: deps.appUrl('/inbox?filter=all'),
                }
              : null,
          arc: arcOverdue > 0 || arcDueSoon > 0 ? { overdue: arcOverdue, dueSoon: arcDueSoon, arcUrl: deps.appUrl('/arc') } : null,
          tasks: mineDue ? { ...mine, tasksUrl: deps.appUrl('/tasks?assignee=me') } : null,
          records:
            recordsOverdue > 0 || recordsDueSoon > 0
              ? { overdue: recordsOverdue, dueSoon: recordsDueSoon, recordsUrl: deps.appUrl('/tickets/records') }
              : null,
        })
        try {
          const res = await deps.sendEmail({ to, ...alert }, outbound)
          if (res.ok) orgSent += 1
          else orgFailed += 1
        } catch {
          orgFailed += 1
        }
      }
      emailed += orgSent
      failed += orgFailed
      logger.info(
        `[daily-digest] ${orgId}: digest sent to ${orgSent} board member(s), ${orgFailed} not delivered`,
      )
    } catch (err) {
      // One org's failure must not stop the others being told.
      logger.error(`[daily-digest] ${orgId}: digest failed`, {
        message: err instanceof Error ? err.name : 'unknown',
      })
    }
  }

  return {
    processed: (orgs ?? []).length,
    brokenMailboxes: brokenTotal,
    waitingThreads: waitingTotal,
    arcOverdue: arcOverdueTotal,
    arcDueSoon: arcDueSoonTotal,
    tasksOverdue: tasksOverdueTotal,
    tasksDueSoon: tasksDueSoonTotal,
    recordsOverdue: recordsOverdueTotal,
    recordsDueSoon: recordsDueSoonTotal,
    emailed,
    failed,
  }
}

export function createDailyDigestJob(deps: DailyDigestDeps) {
  return inngest.createFunction(
    { id: 'daily-digest', name: 'Morning mailbox health check' },
    { cron: 'TZ=America/New_York 0 7 * * *' },
    async ({ logger }) => runDailyDigest(createAdminClient(), deps, logger),
  )
}
