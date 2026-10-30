/**
 * The newest announcement addressed to THIS reader, for the resident home.
 *
 * Scope is the same reach-through the announcements page uses: a
 * communication is readable only when the reader has a
 * communication_recipients row for it, in the active org, matched on unit,
 * account or typed address (resident-scope.ts). Not left to RLS, because
 * getResidentActor returns a service-role client while an admin
 * impersonates an owner.
 *
 * Not a 'use server' file: nothing here is callable from a browser.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import {
  buildRecipientIdentityFilters,
  pickRowPerCommunication,
  type RecipientRow,
  type ResidentIdentity,
} from '@/lib/communications/resident-scope'
import { resolveForDisplay } from '@/lib/communications/display'
import { htmlToPlainText, splitBilingualHtml, type LanguagePreference } from '@/lib/communications/bilingual'
import { loadLanguagePreferences } from '@/lib/communications/recipient-language'

/** Characters of the first line shown on the home card. */
export const ANNOUNCEMENT_PREVIEW_CHARS = 140

/** Recipient rows read; a reader on several channels has several per message. */
const RECIPIENT_ROW_LIMIT = 50
/** Newest messages looked at before giving up (some may be deleted or unsent). */
const CANDIDATE_LIMIT = 10

export interface LatestAnnouncement {
  id: string
  subject: string
  /** First line of the message, plain text, at most ANNOUNCEMENT_PREVIEW_CHARS. */
  preview: string
  /** ISO timestamp the reader was sent it. */
  sentAt: string
}

export type LatestAnnouncementResult =
  | { ok: true; announcement: LatestAnnouncement | null }
  | { ok: false }

/** First non-empty line of plain text, whitespace collapsed, cut at a word boundary. */
export function truncateFirstLine(text: string, max = ANNOUNCEMENT_PREVIEW_CHARS): string {
  const line =
    text
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .find((l) => l.length > 0) ?? ''
  if (line.length <= max) return line
  const cut = line.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut
  return `${base.replace(/[\s.,;:!?-]+$/, '')}…`
}

export interface AnnouncementCommRow {
  id: string
  subject: string
  body_text: string | null
  body_html: string
  sent_at: string | null
  created_at: string
}

export function buildLatestAnnouncement(
  comm: AnnouncementCommRow,
  recipient: RecipientRow | undefined,
  associationName: string,
  language: LanguagePreference,
): LatestAnnouncement {
  const parts = splitBilingualHtml(comm.body_html)
  const useSpanish = language === 'es' && parts.spanish !== null
  const subject =
    useSpanish && parts.spanish?.subject
      ? parts.spanish.subject
      : (recipient?.rendered_subject ?? resolveForDisplay(comm.subject, { associationName }).text)
  const rawBody = useSpanish
    ? htmlToPlainText(parts.spanish?.html ?? '')
    : (comm.body_text ?? htmlToPlainText(parts.englishHtml))
  const preview = truncateFirstLine(resolveForDisplay(rawBody, { associationName }).text)
  return {
    id: comm.id,
    subject,
    preview,
    sentAt: recipient?.sent_at ?? comm.sent_at ?? comm.created_at,
  }
}

export async function loadLatestAnnouncement(
  // Loosely typed like fetchMyAnnouncementRows: RLS client or service-role.
  supabase: { from: (table: string) => any },
  orgId: string | null,
  identity: ResidentIdentity,
  units: Array<{ unit_id: string; association_name: string | null }>,
): Promise<LatestAnnouncementResult> {
  if (!orgId) return { ok: true, announcement: null }
  const filters = buildRecipientIdentityFilters(identity)
  // No identity: nothing was ever addressed to this reader. An empty or()
  // would match every row, so the query is skipped.
  if (filters.length === 0) return { ok: true, announcement: null }

  const { data: recipientData, error: recipientError } = await supabase
    .from('communication_recipients')
    .select('communication_id, rendered_subject, unit_id, sent_at')
    .eq('organization_id', orgId)
    .or(filters.join(','))
    .order('sent_at', { ascending: false, nullsFirst: false })
    .limit(RECIPIENT_ROW_LIMIT)
  if (recipientError) return { ok: false }

  const byComm = pickRowPerCommunication((recipientData ?? []) as RecipientRow[])
  const ids = [...byComm.keys()].slice(0, CANDIDATE_LIMIT)
  if (ids.length === 0) return { ok: true, announcement: null }

  const { data: commData, error: commError } = await supabase
    .from('communications')
    .select('id, subject, body_text, body_html, sent_at, created_at')
    .eq('organization_id', orgId)
    .eq('status', 'sent')
    .is('deleted_at', null)
    .in('id', ids)
  if (commError) return { ok: false }

  const comms = new Map(((commData ?? []) as AnnouncementCommRow[]).map((c) => [c.id, c]))
  // byComm preserves the recipient sent_at ordering; first present wins.
  const newestId = ids.find((id) => comms.has(id))
  if (!newestId) return { ok: true, announcement: null }
  const comm = comms.get(newestId)!
  const recipient = byComm.get(newestId)

  const nameByUnit = new Map(units.map((u) => [u.unit_id, u.association_name ?? '']))
  const associationName =
    (recipient?.unit_id ? nameByUnit.get(recipient.unit_id) : null) || units[0]?.association_name || ''

  // Only 'es' narrows a message (recipient-language.ts); a failed read is
  // an empty map, i.e. English first.
  let prefs = new Map<string, 'es'>()
  if (identity.userId) {
    try {
      prefs = await loadLanguagePreferences(supabase as SupabaseClient<Database>, [identity.userId])
    } catch {
      // Language is a nicety; the message still shows in English.
    }
  }
  const language: LanguagePreference = identity.userId ? (prefs.get(identity.userId) ?? null) : null

  return { ok: true, announcement: buildLatestAnnouncement(comm, recipient, associationName, language) }
}
