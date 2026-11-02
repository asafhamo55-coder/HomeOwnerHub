/**
 * BL-036 autopay emails. Pure builders so the wording is unit-tested.
 *
 * LEGAL REVIEW NEEDED (OA-48): the autopay notice and authorization wording
 * has not been reviewed by counsel (NACHA recurring-debit authorization,
 * card-network recurring-billing notice). Plain words, no legal claims.
 */

import { formatCents } from './decide'

export interface AutopayEmail {
  subject: string
  text: string
  html: string
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function wrap(subject: string, paras: string[], link?: { href: string; label: string }): AutopayEmail {
  const text = [...paras, ...(link ? ['', `${link.label}: ${link.href}`] : [])].join('\n\n')
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111;font-size:16px;">
  <h2 style="margin:0 0 12px 0;font-size:18px;">${esc(subject)}</h2>
  ${paras.map((p) => `<p style="margin:0 0 12px 0;color:#333;">${esc(p)}</p>`).join('\n  ')}
  ${link ? `<p style="margin:0;"><a href="${esc(link.href)}">${esc(link.label)}</a></p>` : ''}
</div>`
  return { subject, text, html }
}

function longDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function methodLabel(m: { type: 'ach' | 'card'; brand: string | null; last4: string | null }): string {
  const kind = m.type === 'ach' ? 'bank account' : m.brand ? `${m.brand} card` : 'card'
  return m.last4 ? `${kind} ending ${m.last4}` : kind
}

export function buildNotice(a: {
  orgName: string
  runDate: string
  totalCents: number
  feeCents: number
  maxCents: number
  method: string
  manageUrl: string
}): AutopayEmail {
  const subject = `Autopay: we will take ${formatCents(a.totalCents)} on ${longDate(a.runDate)}`
  const paras = [
    `On ${longDate(a.runDate)} we will take ${formatCents(a.totalCents)} from your ${a.method} for your ${a.orgName} dues.`,
    ...(a.feeCents > 0 ? [`This includes a ${formatCents(a.feeCents)} payment fee.`] : []),
    `Your limit is ${formatCents(a.maxCents)}. We never take more than that at one time.`,
    'You do not need to do anything. To stop this payment, turn off autopay before that day.',
  ]
  return wrap(subject, paras, { href: a.manageUrl, label: 'Manage autopay' })
}

export function buildOverMax(a: { totalCents: number; maxCents: number; manageUrl: string; payUrl: string }): AutopayEmail {
  const subject = 'We did not charge you: your bill is over your autopay limit'
  return wrap(
    subject,
    [
      `Your autopay limit is ${formatCents(a.maxCents)} and your bill is ${formatCents(a.totalCents)}. We did not charge you.`,
      `You can pay now: ${a.payUrl}`,
    ],
    { href: a.manageUrl, label: 'Raise your limit' },
  )
}

export function buildFailed(a: { paused: boolean; manageUrl: string }): AutopayEmail {
  const subject = a.paused ? 'Autopay is paused' : 'Your autopay payment did not go through'
  const paras = a.paused
    ? [
        'Two autopay payments in a row did not go through, so we paused autopay. Nothing more will be taken until you turn it back on.',
        'Please check your payment method, then turn autopay back on or pay your dues yourself.',
      ]
    : ['Your autopay payment did not go through. We will try again tomorrow. If it fails again, we will pause autopay.']
  return wrap(subject, paras, { href: a.manageUrl, label: 'Manage autopay' })
}

export function buildNeedsAction(a: { link: string }): AutopayEmail {
  return wrap(
    'Your bank needs you to confirm your autopay payment',
    ['Your card company asked you to confirm this payment. It is not finished until you do.'],
    { href: a.link, label: 'Finish your payment' },
  )
}

export function buildCanceledMoved(a: { orgName: string }): AutopayEmail {
  return wrap('Autopay was turned off', [
    `Autopay for your ${a.orgName} home was turned off because you are no longer listed as its owner. Nothing more will be taken.`,
  ])
}

/** Board alert. Names the home by its label only, never the owner or the method. */
export function buildBoardAlert(a: { kind: 'failed' | 'paused' | 'over_max'; unitLabel: string; link: string }): AutopayEmail {
  const what =
    a.kind === 'over_max'
      ? 'was not charged because the bill is over the homeowner\'s autopay limit'
      : a.kind === 'paused'
        ? 'was paused after two payments did not go through'
        : 'did not go through'
  return wrap(`Autopay for ${a.unitLabel}: ${a.kind === 'over_max' ? 'not charged' : a.kind}`, [
    `An autopay payment for ${a.unitLabel} ${what}. The homeowner was emailed.`,
  ], { href: a.link, label: 'See autopay' })
}
