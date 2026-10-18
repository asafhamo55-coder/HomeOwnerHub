/**
 * Vendor COI reminder copy (BL-083): the vendor's email and the board's
 * in-app notice. Pure.
 *
 * There is no upload link for an EXISTING vendor — the onboarding link
 * (vendor_onboarding_invitations) creates a new vendor and expires after
 * 7 days — so the email asks the vendor to reply with the renewed
 * certificate. The reply threads back to the communication's recipient row
 * (sendEmail's recipientRef → our Message-ID), so the board sees it there.
 */

import { whenPhrase, type CoiMilestone } from './milestones'

export interface VendorReminderInput {
  associationName: string
  vendorName: string
  expiresOn: string
  milestone: CoiMilestone
  daysLeft: number
  /** Plain lines from insuranceRequirementLines; empty for none. */
  requirementLines: string[]
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** "October 25, 2026" for a date-only value — formatted in UTC so the
 *  calendar date never shifts a day (BL-043). */
export function formatCalendarDate(day: string): string {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  )
}

function subjectFor(i: VendorReminderInput): string {
  if (i.milestone === 'expired') {
    return i.daysLeft === 0
      ? `Your certificate of insurance with ${i.associationName} expires today`
      : `Your certificate of insurance with ${i.associationName} has expired`
  }
  return `Your certificate of insurance with ${i.associationName} expires ${whenPhrase(i.daysLeft)}`
}

function leadFor(i: VendorReminderInput): string {
  const date = formatCalendarDate(i.expiresOn)
  if (i.milestone === 'expired' && i.daysLeft < 0) {
    return `The certificate of insurance ${i.associationName} has on file for ${i.vendorName} expired on ${date}.`
  }
  return `The certificate of insurance ${i.associationName} has on file for ${i.vendorName} expires ${
    i.daysLeft === 0 ? 'today' : `on ${date}`
  }.`
}

const ASK = 'To keep working with the association, please reply to this email with your renewed certificate attached.'

export function renderVendorReminder(i: VendorReminderInput): { subject: string; html: string; text: string } {
  const subject = subjectFor(i)
  const lead = leadFor(i)
  const reqHtml =
    i.requirementLines.length === 0
      ? ''
      : `<p style="margin:16px 0 4px;">The renewed certificate must show at least:</p>
<ul style="margin:0 0 16px;padding-left:20px;">${i.requirementLines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`
  const html = `<!doctype html>
<html><body style="font-family:-apple-system,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#222;line-height:1.5;">
<h1 style="font-size:18px;margin:0 0 16px;">${escapeHtml(subject)}</h1>
<p>Hello ${escapeHtml(i.vendorName)},</p>
<p>${escapeHtml(lead)}</p>
<p>${escapeHtml(ASK)}</p>
${reqHtml}
<p style="font-size:12px;color:#666;margin-top:24px;">You’re receiving this because ${escapeHtml(i.vendorName)} is a vendor for ${escapeHtml(i.associationName)}. If you’ve already sent a renewed certificate, thank you — no need to send it again.</p>
</body></html>`
  const req =
    i.requirementLines.length === 0
      ? ''
      : `\n\nThe renewed certificate must show at least:\n${i.requirementLines.map((l) => `- ${l}`).join('\n')}`
  const text = `Hello ${i.vendorName},

${lead}

${ASK}${req}

You’re receiving this because ${i.vendorName} is a vendor for ${i.associationName}. If you’ve already sent a renewed certificate, thank you — no need to send it again.`
  return { subject, html, text }
}

export type VendorEmailOutcome = 'emailed' | 'no_email' | 'reminders_off' | 'not_sent'

export function renderBoardNotice(i: {
  vendorName: string
  expiresOn: string
  milestone: CoiMilestone
  daysLeft: number
  outcome: VendorEmailOutcome
}): { title: string; body: string } {
  const title =
    i.milestone === 'expired'
      ? i.daysLeft === 0
        ? `${i.vendorName}: insurance expires today`
        : `${i.vendorName}: insurance has expired`
      : `${i.vendorName}: insurance expires ${whenPhrase(i.daysLeft)}`
  const when = `Certificate of insurance ${i.daysLeft < 0 ? 'expired' : 'expires'} ${formatCalendarDate(i.expiresOn)}.`
  const next: Record<VendorEmailOutcome, string> = {
    emailed: 'We emailed the vendor for a renewed certificate.',
    no_email: 'No email on file for this vendor — contact them directly.',
    reminders_off: 'Vendor reminders are off in Settings → Vendors.',
    not_sent: 'The reminder email didn’t go out — contact the vendor directly.',
  }
  return { title, body: `${when} ${next[i.outcome]}` }
}
