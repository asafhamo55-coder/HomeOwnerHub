import { createAdminClient } from '@homeowner-portal/db'
import { fetchOrgSandbox } from '@homeowner-portal/observability/outbound-guard'
import { inngest } from './client'
// Dependency-free (no imports of its own), shared with the inbox list so the
// digest's "waiting" means exactly what the badge means. Same relative-path
// pattern as mailbox-attachments.ts -> attachment-state.ts.
import { loadInboxSlaHours, waitingCutoffIso } from '../../../apps/hoa/src/lib/inbox/waiting'

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

/**
 * One recipient's morning email: the mailbox alert when a mailbox is
 * broken, the waiting block when residents are waiting, or both.
 */
export function buildDigestEmail(args: {
  orgName: string
  mailboxes: BrokenMailbox[]
  reconnectUrl: string
  waiting: { total: number; mine: number; hours: number; inboxUrl: string } | null
}): { subject: string; html: string; text: string } {
  const block = args.waiting && args.waiting.total > 0 ? buildWaitingBlock(args.waiting) : null
  if (args.mailboxes.length > 0) {
    const alert = buildMailboxAlert(args)
    if (!block) return alert
    return {
      subject: alert.subject,
      text: `${alert.text}\n\n${block.text}`,
      html: alert.html.replace(/<\/div>\s*$/, `${block.html}\n</div>`),
    }
  }
  const who = args.waiting && args.waiting.total === 1 ? '1 resident' : `${args.waiting?.total ?? 0} residents`
  const text = [
    `Good morning. This is your daily check from HomeownerHub for ${args.orgName}.`,
    '',
    block ? block.text : '',
  ].join('\n')
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.5;color:#111827">
  <p>Good morning. This is your daily check from HomeownerHub for ${escapeHtml(args.orgName)}.</p>${block ? block.html : ''}
</div>`
  return { subject: `${who} waiting for a reply — ${args.orgName}`, html, text }
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
    if (broken.length === 0 && waitingCount === 0) continue
    if (waitingCount > 0) {
      // A count, never which residents.
      logger.info(`[daily-digest] ${orgId}: ${waitingCount} thread(s) waiting past the threshold`)
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
