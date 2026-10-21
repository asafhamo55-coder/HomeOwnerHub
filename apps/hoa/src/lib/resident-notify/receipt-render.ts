/**
 * BL-114 — the payment receipt an owner receives when the board records
 * their payment. Pure: subject, HTML and plain text.
 *
 * What it carries, and nothing more: the association's name, the amount,
 * the day the payment was dated, how it was paid, the property it was
 * credited to, the balance remaining on that property, and a link to the
 * owner's own portal ledger. No other resident's name, address or balance,
 * no memo or bank reference, no internal ids.
 */

import { escapeHtml, renderEmailDocument } from '@/lib/email/shell'
import { formatDay, usd } from '@/lib/money/format'

export interface RenderedReceipt {
  subject: string
  html: string
  text: string
}

const METHOD_LABELS: Record<string, string> = {
  zelle_assisted: 'Zelle',
  ach: 'Bank transfer',
  card: 'Card',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
  check: 'Check',
  cash: 'Cash',
}

/** How the payment was made, in words. 'other' and unknown methods read as recorded by the board. */
export function receiptMethodLabel(method: string | null | undefined): string {
  return (method && METHOD_LABELS[method]) || 'Recorded by the board'
}

const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif"
const ACCENT = '#1F6F5C'

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 4px;"><tr><td bgcolor="${ACCENT}" style="background-color:${ACCENT};border-radius:6px;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:11px 18px;font-family:${FONT};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:6px 16px 6px 0;font-size:13px;color:#5B646C;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 0;font-size:14px;color:#1A1D21;font-weight:600;">${escapeHtml(value)}</td></tr>`
}

/** "$0.00", or "$25.00 credit" when the owner is ahead. */
export function balanceLabel(balance: number): string {
  if (balance < 0) return `${usd(-balance)} credit`
  return usd(balance)
}

export function renderPaymentReceiptEmail(i: {
  associationName: string
  amount: number
  /** yyyy-mm-dd in the association's zone. */
  paidDay: string
  method: string | null
  /** The owner's own property, e.g. "12 Oak St · Unit 4". */
  propertyLabel: string | null
  /** Balance remaining on the property after this payment; null when it couldn't be read. */
  balance: number | null
  portalUrl: string
}): RenderedReceipt {
  const amount = usd(i.amount)
  const day = formatDay(i.paidDay)
  const subject = `Payment received: ${amount}`
  const lead = `${i.associationName} recorded your payment of ${amount}. Thank you.`
  const method = receiptMethodLabel(i.method)
  const balance = i.balance === null ? null : balanceLabel(i.balance)

  const rows = [
    row('Amount', amount),
    row('Date', day),
    row('Paid by', method),
    i.propertyLabel ? row('Property', i.propertyLabel) : '',
    balance !== null ? row('Remaining balance', balance) : '',
  ].join('')

  const balanceNote =
    balance === null ? 'Your current balance is in your ledger in the resident portal.' : ''

  const html = renderEmailDocument({
    fluid: true,
    previewText: subject,
    band: { text: i.associationName, color: ACCENT },
    bodyHtml: `<div style="font-family:${FONT};font-size:15px;line-height:1.6;color:#1A1D21;">
<p style="margin:0 0 12px;">Hello,</p>
<p style="margin:0 0 12px;">${escapeHtml(lead)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;font-family:${FONT};">${rows}</table>
${balanceNote ? `<p style="margin:12px 0 0;font-size:14px;color:#5B646C;">${escapeHtml(balanceNote)}</p>` : ''}
${button(i.portalUrl, 'View your ledger')}
</div>`,
    footerHtml: `You’re receiving this because ${escapeHtml(i.associationName)} emails owners a receipt when the board records a payment. Keep it for your records. Replies to this email may not be read — use the resident portal to contact the board.`,
  })

  const lines = [
    `Amount: ${amount}`,
    `Date: ${day}`,
    `Paid by: ${method}`,
    ...(i.propertyLabel ? [`Property: ${i.propertyLabel}`] : []),
    ...(balance !== null ? [`Remaining balance: ${balance}`] : []),
  ]
  const text = `Hello,

${lead}

${lines.join('\n')}
${balanceNote ? `\n${balanceNote}\n` : ''}
View your ledger in the resident portal:
${i.portalUrl}

— ${i.associationName}`

  return { subject, html, text }
}
