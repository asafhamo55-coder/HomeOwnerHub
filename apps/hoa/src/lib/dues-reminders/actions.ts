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
  { ok: true; associationId: string } | { ok: false; error: string }
> {
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No organization found.' }

  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin' && role !== 'board') return { ok: false, error: DENIED }

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  return { ok: true, associationId: assoc.id }
}

/** Bulk targets past-due owners only; an explicit email list targets
 *  exactly those people, past due or not — the manager picked them. */
function selectPackets(packets: ReminderPacket[], emails?: string[]): ReminderPacket[] {
  if (emails && emails.length > 0) {
    const wanted = new Set(emails.map((e) => e.trim().toLowerCase()))
    return packets.filter((p) => wanted.has(p.email))
  }
  return packets.filter((p) => p.pastDueTotal > 0)
}

export async function previewDuesReminders(
  input?: { emails?: string[] },
): Promise<PreviewResult> {
  const ctx = await loadContext()
  if (!ctx.ok) return ctx

  const { packets: all, skipped } = await buildReminderPackets(ctx.associationId)
  const selected = selectPackets(all, input?.emails)
  const lastReminded = await getLastRemindedByEmail(ctx.associationId)

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
  // {{owner_name}} appears twice in the shell (greeting + footer isn't
  // owner_name, but the greeting line alone can still recur if the shell
  // changes) — use a global regex so the preview can't silently diverge
  // from what the send pipeline actually renders, which also uses a
  // global replace via renderTemplate.
  const previewHtml = first
    ? renderShellHtml({ portalUrl: portalUrl() })
        .replace('{{dues_table}}', renderDuesTableHtml(first))
        .replace(/\{\{owner_name\}\}/g, escapeHtml(first.ownerName))
    : ''

  return {
    ok: true,
    packets: summaries,
    skipped,
    totalOutstanding: Math.round(selected.reduce((s, p) => s + p.totalDue, 0) * 100) / 100,
    recentlyRemindedCount: summaries.filter((s) => s.recentlyReminded).length,
    emailConfigured: emailConfigured(),
    previewHtml,
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

  const note = input.note?.trim().slice(0, 500)

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
