/**
 * One definition of "which announcements are mine, and how many are new".
 *
 * The resident portal had three. The announcements page reached through
 * `communication_recipients` correctly; the two badges — resident.ts and
 * resident-dashboard.ts, identical copies — counted every `communications`
 * row the ORG had sent in 30 days. A Madison Park owner saw "15 new" above
 * a list of 3, because the badge was counting other owners' mail, dues
 * reminders included. That is the same scope bug the page's own header
 * comment documents having fixed; the badges were never updated to match.
 *
 * The count lives here so a fourth copy is harder to write than a reuse.
 */

import { buildRecipientIdentityFilters } from './communications/resident-scope'

export interface AnnouncementRow {
  communication_id: string
  sent_at: string | null
}

/**
 * How many distinct announcements arrived since `lastViewedAt`.
 *
 * Deduplicates by communication: the send pipeline writes one row per
 * (recipient x channel), so a reader on both email and portal has several
 * rows for one message and must not be told there are two.
 *
 * `lastViewedAt` of null means the page has never been opened, so
 * everything received counts. The comparison is strictly greater-than, so
 * an announcement sent in the same instant the page stamped its visit
 * counts as read rather than being stranded unread forever.
 *
 * A row with no `sent_at` never reached the resident and cannot be
 * something they missed.
 */
export function countNewAnnouncements(
  rows: AnnouncementRow[],
  lastViewedAt: string | null,
): number {
  const seen = new Set<string>()
  for (const row of rows) {
    if (!row.sent_at) continue
    if (lastViewedAt && row.sent_at <= lastViewedAt) continue
    seen.add(row.communication_id)
  }
  return seen.size
}

export interface ReaderIdentity {
  unitIds: string[]
  userId: string | null
  email: string | null
}

/** Rows are capped well above the badge's needs; see the page's own limit. */
const ROW_LIMIT = 300

/**
 * Fetch this reader's recipient rows, the same reach-through the
 * announcements page uses.
 *
 * Returns [] when the reader has no identity to match on. That case is not
 * cosmetic: an empty `.or()` matches every row, which is precisely how a
 * resident once saw other owners' mail.
 */
export async function fetchMyAnnouncementRows(
  // Loosely typed on purpose: callers hand in either the RLS client or the
  // service-role client getResidentActor returns while an admin impersonates.
  supabase: {
    from: (table: string) => any
  },
  orgId: string,
  identity: ReaderIdentity,
): Promise<AnnouncementRow[]> {
  const filters = buildRecipientIdentityFilters(identity)
  if (filters.length === 0) return []

  const { data } = await supabase
    .from('communication_recipients')
    .select('communication_id, sent_at')
    .eq('organization_id', orgId)
    .or(filters.join(','))
    .order('sent_at', { ascending: false, nullsFirst: false })
    .limit(ROW_LIMIT)

  return (data ?? []) as AnnouncementRow[]
}

/**
 * When this reader last opened the announcements page.
 *
 * Returns null — "never opened, everything is new" — when the column is not
 * there yet. Migration 0052 adds it, and this ships ahead of that migration
 * being applied; a hard failure here would take down the resident portal's
 * home page over a badge. Once the column lands the value simply starts
 * being read, with no second deploy.
 */
export async function getAnnouncementsLastViewedAt(
  supabase: { from: (table: string) => any },
  userId: string | null,
): Promise<string | null> {
  if (!userId) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('announcements_last_viewed_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) return null
  return (data as { announcements_last_viewed_at: string | null } | null)
    ?.announcements_last_viewed_at ?? null
}

/**
 * Stamp the visit. Failures are swallowed for the same reason as above, and
 * because the worst case is a badge that stays lit — never a resident who
 * cannot read their announcements.
 */
export async function markAnnouncementsViewed(
  supabase: { from: (table: string) => any },
  userId: string | null,
): Promise<void> {
  if (!userId) return
  try {
    await supabase
      .from('profiles')
      .update({ announcements_last_viewed_at: new Date().toISOString() })
      .eq('id', userId)
  } catch {
    // pre-migration no-op
  }
}
