import { createAdminClient } from '@homeowner-portal/db'
import { fetchOrgSandbox } from '@homeowner-portal/observability/outbound-guard'
import { inngest } from './client'

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

/** Board/admin email addresses for one org. Never residents. [] (logged) on a failed read. */
async function boardEmails(db: Db, orgId: string, logger: DigestLogger): Promise<string[]> {
  try {
    return (await loadBoardRecipients(db, orgId)).map((r) => r.email)
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
  let emailed = 0
  let failed = 0

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
      // values) and keep going to the next org.
      logger.error(`[daily-digest] ${orgId}: failed to check mailbox sync status`, {
        code: brokenMailboxesError.code,
        message: brokenMailboxesError.message,
      })
      continue
    }

    const broken = (brokenMailboxes ?? []) as BrokenMailbox[]
    if (broken.length === 0) continue

    for (const mailbox of broken) {
      brokenTotal += 1
      // Ids and status only: the address and sync_error stay out of logs.
      logger.error(`[daily-digest] ${orgId}: mailbox ${mailbox.id} is ${mailbox.sync_status}`)
    }

    try {
      const recipients = await boardEmails(db, orgId, logger)
      if (recipients.length === 0) {
        logger.warn(`[daily-digest] ${orgId}: no board member with an email to alert`)
        continue
      }

      const alert = buildMailboxAlert({
        orgName: org.name ?? 'your community',
        mailboxes: broken,
        reconnectUrl: deps.appUrl('/settings/mailbox'),
      })
      const outbound = { orgSandbox: await fetchOrgSandbox(db, orgId), ref: orgId }

      let orgSent = 0
      let orgFailed = 0
      for (const to of recipients) {
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
        `[daily-digest] ${orgId}: mailbox alert sent to ${orgSent} board member(s), ${orgFailed} not delivered`,
      )
    } catch (err) {
      // One org's failure must not stop the others being told.
      logger.error(`[daily-digest] ${orgId}: mailbox alert failed`, {
        message: err instanceof Error ? err.name : 'unknown',
      })
    }
  }

  return { processed: (orgs ?? []).length, brokenMailboxes: brokenTotal, emailed, failed }
}

export function createDailyDigestJob(deps: DailyDigestDeps) {
  return inngest.createFunction(
    { id: 'daily-digest', name: 'Morning mailbox health check' },
    { cron: 'TZ=America/New_York 0 7 * * *' },
    async ({ logger }) => runDailyDigest(createAdminClient(), deps, logger),
  )
}
