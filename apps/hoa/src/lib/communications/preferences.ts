/**
 * Resident channel preferences for broadcast sends (BL-102 finding 3).
 *
 * The same policy BL-082 resident notices already follow
 * (lib/resident-notify/store.ts loadPreferences), so the app has one rule:
 *
 *   - email goes unless the resident set `email_opt_in = false`;
 *   - a text goes only when the resident set `sms_opt_in = true`.
 *
 * No row means the table's own defaults (0018): email on, texts off. A
 * recipient with no portal account (no user id) can't have a row, so they
 * get email and no text.
 *
 * An official notice (BL-020, behind M1) keeps its own email rule — the
 * e-consent plan in ./official-notice.ts decides who is emailed, and
 * email_opt_in is not consulted. Texts still need sms_opt_in.
 *
 * Board and custom-contact audiences are not residents, so preferences
 * don't apply to them (board members are never texted anyway; see
 * ./audience.ts).
 *
 * Pure apart from loadPreferenceMap. Nothing here logs.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'

export interface ChannelPrefs {
  email: boolean
  sms: boolean
}

export type PreferenceMap = ReadonlyMap<string, ChannelPrefs>

/** The table's defaults (0018) — what a resident with no row gets. */
export const DEFAULT_PREFS: ChannelPrefs = { email: true, sms: false }

/** Audience kinds that are not residents, so preferences never apply. */
export const PREFERENCE_EXEMPT_AUDIENCES: ReadonlySet<string> = new Set(['board', 'manual_emails'])

export interface PreferenceRow {
  user_id: string | null
  email_opt_in: boolean | null
  sms_opt_in: boolean | null
}

/**
 * One entry per user. A user can hold several rows (one per unit); the
 * fold is conservative both ways — any row saying no to email turns email
 * off, and texts stay on only when every row says yes.
 */
export function foldPreferenceRows(rows: readonly PreferenceRow[]): Map<string, ChannelPrefs> {
  const out = new Map<string, ChannelPrefs>()
  for (const row of rows) {
    if (!row.user_id) continue
    const email = row.email_opt_in !== false
    const sms = row.sms_opt_in === true
    const prev = out.get(row.user_id)
    out.set(row.user_id, prev ? { email: prev.email && email, sms: prev.sms && sms } : { email, sms })
  }
  return out
}

export function prefsFor(userId: string | null, map: PreferenceMap): ChannelPrefs {
  if (!userId) return DEFAULT_PREFS
  return map.get(userId) ?? DEFAULT_PREFS
}

export interface PreferencePolicy {
  /** null: preferences don't apply to this send (non-resident audience). */
  map: PreferenceMap | null
  /** True for an official notice with M1 applied: email follows e-consent,
   *  not email_opt_in. */
  officialNoticeEmail: boolean
}

/**
 * Split a recipient's deliverable channels into the ones they get and the
 * ones their preferences turn off. `channels` must already be the
 * deliverable set (./official-notice.ts deliverableChannels), so a channel
 * appears in `optedOut` only when the resident could otherwise have
 * received it.
 */
export function applyPreferences<C extends string>(
  userId: string | null,
  channels: readonly C[],
  policy: PreferencePolicy,
): { keep: C[]; optedOut: C[] } {
  if (!policy.map) return { keep: [...channels], optedOut: [] }
  const prefs = prefsFor(userId, policy.map)
  const keep: C[] = []
  const optedOut: C[] = []
  for (const c of channels) {
    const off = (c === 'email' && !policy.officialNoticeEmail && !prefs.email) || (c === 'sms' && !prefs.sms)
    if (off) optedOut.push(c)
    else keep.push(c)
  }
  return { keep, optedOut }
}

/** Whether this send needs the preference table read at all. */
export function preferencesApply(audienceKind: string, channels: readonly string[]): boolean {
  if (PREFERENCE_EXEMPT_AUDIENCES.has(audienceKind)) return false
  return channels.includes('email') || channels.includes('sms')
}

const PAGE = 1000

/**
 * Every preference row for the org, paged. Rows are few (one per resident
 * who changed a setting, BL-110), so reading the org’s whole set is cheaper than
 * an `in (...)` over hundreds of user ids, which would also overflow the
 * request URL. A failed read returns ok:false — the caller refuses the
 * send rather than defaulting to "send to everyone".
 */
export async function loadPreferenceMap(
  db: SupabaseClient<Database>,
  organizationId: string,
): Promise<{ ok: true; map: Map<string, ChannelPrefs> } | { ok: false }> {
  const rows: PreferenceRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('resident_communication_preferences')
      .select('user_id, email_opt_in, sms_opt_in')
      .eq('organization_id', organizationId)
      .not('user_id', 'is', null)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) return { ok: false }
    const page = (data ?? []) as PreferenceRow[]
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return { ok: true, map: foldPreferenceRows(rows) }
}

export const PREFERENCES_READ_FAILED = 'Couldn’t check residents’ message preferences. Nothing was sent.'
