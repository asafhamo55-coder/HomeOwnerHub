'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentOrg } from '@/lib/orgs'
import { getCurrentUserRoleInOrg } from '@/lib/auth'
import { getPrimaryAssociation } from '@/lib/vendors'
import { sendCommunication } from '@/lib/communications/send'
import { buildReminderPackets } from './packets'
import { DUES_REMINDER_RESOURCE_TYPE, RECENT_REMINDER_DAYS, getLastRemindedByEmail } from './queries'
import {
  SUBJECT_TEMPLATE,
  amountSummary,
  escapeHtml,
  neutralizeMergeSyntax,
  renderDuesTableHtml,
  renderDuesTableText,
  renderShellHtml,
  renderShellText,
} from './render'
import type { ReminderPacket, SkippedOwner } from './types'

const DENIED = "You don't have permission to perform this action."

export interface PacketSummary {
  email: string
  ownerName: string
  propertyCount: number
  totalDue: number
  pastDueTotal: number
  oldestDaysLate: number
  lastRemindedAt: string | null
  recentlyReminded: boolean
}

export type PreviewResult =
  | {
      ok: true
      packets: PacketSummary[]
      skipped: SkippedOwner[]
      totalOutstanding: number
      recentlyRemindedCount: number
      emailConfigured: boolean
      previewHtml: string
      /** True when getLastRemindedByEmail's lookup failed. Every packet's
       *  lastRemindedAt/recentlyReminded still reads as "no recent
       *  reminder" in that case — this flag is what tells the UI that
       *  reading is unknown, not confirmed clean, so it doesn't get
       *  rendered as if it were a real answer. */
      reminderHistoryUnavailable: boolean
    }
  | { ok: false; error: string }

export type SendResult =
  | { ok: true; communicationId: string; sentCount: number; failedCount: number }
  | { ok: false; error: string }

/** Resend no-ops and reports success when unconfigured (see email.ts).
 *  Inheriting that would let the UI claim "14 sent" having sent nothing,
 *  so every entry point checks this first. */
function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

function portalUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}/resident/dues`
}

async function loadContext(): Promise<
  { ok: true; associationId: string; associationName: string } | { ok: false; error: string }
> {
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No organization found.' }

  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin' && role !== 'board') return { ok: false, error: DENIED }

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  return { ok: true, associationId: assoc.id, associationName: assoc.name }
}

/** Bulk targets past-due owners only; an explicit email list targets
 *  exactly those people, past due or not — the manager picked them.
 *
 *  An empty array is an explicit list that happens to name nobody, and
 *  selects nobody. Only an absent list means "everyone past due" — the UI
 *  never sends `[]`, but a server action is directly invocable and the
 *  fallthrough would have quietly mailed the whole association. */
function selectPackets(packets: ReminderPacket[], emails?: string[]): ReminderPacket[] {
  if (emails) {
    const wanted = new Set(emails.map((e) => e.trim().toLowerCase()))
    return packets.filter((p) => wanted.has(p.email))
  }
  return packets.filter((p) => p.pastDueTotal > 0)
}

/** The note is free text the manager typed, and it is baked into a shell
 *  that the send pipeline then runs through renderTemplate — so it has to
 *  be made inert first, or a note containing {{anything}} loses those
 *  words on the way out. Trimmed and capped to match the textarea. */
function prepareNote(note: string | undefined): string | undefined {
  const trimmed = note?.trim().slice(0, 500)
  return trimmed ? neutralizeMergeSyntax(trimmed) : undefined
}

export async function previewDuesReminders(
  input?: { emails?: string[]; note?: string },
): Promise<PreviewResult> {
  const ctx = await loadContext()
  if (!ctx.ok) return ctx

  const { packets: all, skipped } = await buildReminderPackets(ctx.associationId)
  const selected = selectPackets(all, input?.emails)
  const lastRemindedResult = await getLastRemindedByEmail(ctx.associationId)
  // A failed lookup degrades to "we don't know" (empty map, flag set)
  // rather than blocking the preview — see queries.ts. The flag is what
  // keeps the empty map from being read downstream as "confirmed clean".
  const reminderHistoryUnavailable = !lastRemindedResult.ok
  const lastReminded = lastRemindedResult.ok
    ? lastRemindedResult.lastReminded
    : new Map<string, string>()

  const cutoff = Date.now() - RECENT_REMINDER_DAYS * 86_400_000
  const summaries: PacketSummary[] = selected.map((p) => {
    const at = lastReminded.get(p.email) ?? null
    return {
      email: p.email,
      ownerName: p.ownerName,
      propertyCount: p.properties.length,
      totalDue: p.totalDue,
      pastDueTotal: p.pastDueTotal,
      oldestDaysLate: p.oldestDaysLate,
      lastRemindedAt: at,
      recentlyReminded: at !== null && Date.parse(at) >= cutoff,
    }
  })

  const first = selected[0]
  // Substitute exactly what the send pipeline substitutes, from the same
  // shell and the same note — a preview that omits a placeholder shows the
  // manager a literal "{{association_name}}", and one that omits the note
  // hides the only hand-written part of the email from review.
  //
  // Replacements are functions, not strings, because a string replacement
  // interprets `$&` and friends — and these values carry currency and
  // escaped entities.
  const previewHtml = first
    ? renderShellHtml({ note: prepareNote(input?.note), portalUrl: portalUrl() })
        .replace(/\{\{dues_table\}\}/g, () => renderDuesTableHtml(first))
        .replace(/\{\{owner_name\}\}/g, () => escapeHtml(first.ownerName))
        .replace(/\{\{association_name\}\}/g, () => escapeHtml(ctx.associationName))
    : ''

  return {
    ok: true,
    packets: summaries,
    skipped,
    totalOutstanding: Math.round(selected.reduce((s, p) => s + p.totalDue, 0) * 100) / 100,
    recentlyRemindedCount: summaries.filter((s) => s.recentlyReminded).length,
    emailConfigured: emailConfigured(),
    previewHtml,
    reminderHistoryUnavailable,
  }
}

export async function sendDuesReminders(
  input: { emails: string[]; note?: string },
): Promise<SendResult> {
  const ctx = await loadContext()
  if (!ctx.ok) return ctx

  if (!emailConfigured()) {
    return { ok: false, error: 'Email delivery is not configured, so nothing would be sent.' }
  }

  const { packets: all } = await buildReminderPackets(ctx.associationId)
  const selected = selectPackets(all, input.emails)
  if (selected.length === 0) {
    return { ok: false, error: 'None of the selected owners currently owe anything.' }
  }

  const note = prepareNote(input.note)

  const recipients = selected.map((p) => ({
    unitId: p.properties[0].unitId,
    unitIds: p.properties.map((prop) => prop.unitId),
    unitAddress: p.properties[0].label,
    unitNumber: null,
    recipientName: p.ownerName,
    email: p.email,
    phone: null,
    userId: p.userId,
  }))

  const extraMergeFields: Record<string, Record<string, string>> = {}
  for (const p of selected) {
    extraMergeFields[p.email] = {
      dues_table: renderDuesTableHtml(p),
      dues_text: renderDuesTableText(p),
      amount_summary: amountSummary(p),
      // The send pipeline's renderTemplate does a raw string replace with
      // no escaping (unlike this file's own renderer, which escapes
      // property labels and the manager's note). Owner names are
      // staff-entered, same source as property labels, so they get the
      // same treatment: escaped for the HTML body via {{owner_name}},
      // and a second, unescaped placeholder — {{owner_name_text}} — for
      // the plain-text body, where escaping would corrupt the reading
      // (an owner named "Smith & Sons" must not read "Smith &amp; Sons").
      owner_name: escapeHtml(p.ownerName),
      owner_name_text: p.ownerName,
      // The association name is staff-entered too and reaches the same two
      // contexts, so it gets the same split. Supplying it here overrides
      // the pipeline's own base bag for THIS campaign only — no other
      // communication template's rendering changes.
      association_name: escapeHtml(ctx.associationName),
      association_name_text: ctx.associationName,
    }
  }

  const result = await sendCommunication({
    category: 'dues',
    subject: SUBJECT_TEMPLATE,
    bodyHtml: renderShellHtml({ note, portalUrl: portalUrl() }),
    bodyText: renderShellText({ note, portalUrl: portalUrl() }),
    channels: ['email'],
    audience: {
      kind: 'precomputed',
      recipients,
      summary: `${selected.length} owner${selected.length === 1 ? '' : 's'} with outstanding dues`,
    },
    relatedResource: { type: DUES_REMINDER_RESOURCE_TYPE, id: ctx.associationId },
    extraMergeFields,
  })

  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/dues')
  return {
    ok: true,
    communicationId: result.communicationId,
    sentCount: result.sentCount,
    failedCount: result.failedCount,
  }
}
