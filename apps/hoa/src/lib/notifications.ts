'use server'

/**
 * In-app notifications for board members — reads and read-state writes.
 *
 * This is the durable half of the ticket-notification design
 * (docs/superpowers/specs/2026-08-31-ticket-notifications-design.md). Web
 * Push is the instant channel and is best-effort; `notifications` is the
 * record. A board member who never grants push permission still sees
 * everything here, which is why this surface has to work on its own.
 *
 * TWO SCOPES ON EVERY QUERY
 *
 * Every statement below filters on BOTH organization_id AND user_id, the
 * same discipline lib/communications/send.ts applies to browser-supplied
 * ids. RLS on this table (migration 0053) gates on org membership only —
 * `organization_id = ANY (auth_org_ids())` — so it would happily hand a
 * board member every OTHER board member's notifications. The user_id
 * filter is not defence in depth here; it is the only thing separating
 * two people in the same HOA. The org filter is the backstop against a
 * row id from another tenant.
 *
 * WHY NOTHING HERE THROWS
 *
 * Migration 0053 is NOT applied yet; this code ships first, deliberately.
 * Until it runs, every query below fails with "relation does not exist".
 * These functions are called from the dashboard layout's header, which
 * wraps every single board-side page — so a throw here is not a broken
 * bell, it is a blank product. Reads degrade to an empty list or a zero
 * count, writes to `{ ok: false }`, and the bell renders as "no
 * notifications" until the migration lands.
 *
 * Note that supabase-js returns `{ data, error }` rather than throwing, so
 * the missing table is already handled by the `?? []` fallbacks. The
 * try/catch is for the layer underneath that — a client that cannot be
 * constructed, a fetch that rejects — which does throw.
 *
 * NO POLLING, NO REALTIME
 *
 * The count is computed server-side on navigation and that is the whole
 * refresh story. Real-time delivery is Web Push's job by design; adding an
 * interval here would put a query on every board member's session every
 * few seconds to duplicate a channel that already exists.
 */

import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface NotificationRow {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  entity_type: string | null
  entity_id: string | null
  read_at: string | null
  created_at: string
}

export type NotificationActionResult = { ok: true } | { ok: false; error: string }

const NOTIFICATION_COLUMNS =
  'id, kind, title, body, link, entity_type, entity_id, read_at, created_at'

/** Default page size for the bell dropdown. Enough to cover a busy week
 *  without turning the header into a scrolling inbox — the full history
 *  belongs on the entity itself (/tickets, /violations, …). */
const DEFAULT_LIMIT = 15

/**
 * The signed-in board member's own notifications, newest first.
 *
 * Read and unread both, because the dropdown's value is "what happened
 * recently", not "what is outstanding" — hiding read items would make the
 * panel go empty the moment someone clicks through one.
 */
export async function getMyNotifications(limit: number = DEFAULT_LIMIT): Promise<NotificationRow[]> {
  // Outside the try: requireBoardOrAdmin signals failure by calling
  // redirect(), which works by THROWING a NEXT_REDIRECT error. Catching it
  // would silently swallow the auth gate and return an empty list to an
  // unauthorised caller instead of bouncing them.
  const { org } = await requireBoardOrAdmin()

  try {
    const supabase = await getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return []

    // `as never` because 0053 has not been applied, so `notifications` is
    // absent from the generated Database types — same pattern as
    // lib/resident-tickets.ts's `.from('tickets' as never)`. Regenerating
    // types will not fix this until the migration is live (see CLAUDE.md
    // §3 on gen:types reading the live database).
    const { data } = await supabase
      .from('notifications' as never)
      .select(NOTIFICATION_COLUMNS)
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      // Clamped rather than trusted: the parameter has no caller today that
      // passes anything but the default, but an unbounded limit reaching
      // PostgREST from a page prop is a slow-query waiting to happen.
      .limit(Math.min(Math.max(1, Math.floor(limit)), 100))

    return (data ?? []) as unknown as NotificationRow[]
  } catch {
    return []
  }
}

/**
 * How many of the signed-in board member's notifications are unread.
 *
 * `read_at IS NULL` is the unread predicate — 0053 stores a timestamp
 * rather than a boolean precisely so "when did they see it" stays
 * answerable. `head: true` means Postgres returns the count without the
 * rows, which matters because this runs on every board-side navigation.
 */
export async function getMyUnreadCount(): Promise<number> {
  const { org } = await requireBoardOrAdmin()

  try {
    const supabase = await getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return 0

    const { count } = await supabase
      .from('notifications' as never)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .is('read_at', null)

    return count ?? 0
  } catch {
    return 0
  }
}

/**
 * Marks one notification read.
 *
 * `id` arrives from the browser, so both scopes are repeated on the
 * UPDATE rather than inherited from whatever read produced the id. An
 * unknown id and someone else's id both come back as the same plain
 * `{ ok: false }` — a distinct "not found" would make this an existence
 * oracle for other people's notifications, the same reasoning
 * resendFailedRecipients applies to communications.
 *
 * Already-read rows are not special-cased: re-stamping read_at on a row
 * that is already read is harmless, and checking first would cost a
 * round trip to prevent nothing.
 */
export async function markNotificationRead(id: string): Promise<NotificationActionResult> {
  const { org } = await requireBoardOrAdmin()

  try {
    const supabase = await getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Not signed in.' }

    const { error } = await supabase
      .from('notifications' as never)
      .update({ read_at: new Date().toISOString() } as never)
      .eq('id', id)
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      // Only unread rows, so a second click cannot rewrite the original
      // "when did they first see it" timestamp with a later one.
      .is('read_at', null)

    if (error) return { ok: false, error: 'Could not update that notification.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Notifications are not available yet.' }
  }
}

/**
 * Marks every unread notification of the signed-in board member read.
 *
 * The `.is('read_at', null)` filter is what keeps this idempotent and
 * cheap: without it, a board member with a year of history rewrites every
 * row's timestamp on each click and destroys the read history.
 */
export async function markAllNotificationsRead(): Promise<NotificationActionResult> {
  const { org } = await requireBoardOrAdmin()

  try {
    const supabase = await getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Not signed in.' }

    const { error } = await supabase
      .from('notifications' as never)
      .update({ read_at: new Date().toISOString() } as never)
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .is('read_at', null)

    if (error) return { ok: false, error: 'Could not update your notifications.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Notifications are not available yet.' }
  }
}
