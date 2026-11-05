/**
 * BL-035 PR 6: the words for payment problems. Pure: each builder returns a
 * subject and plain text; the sender wraps it. Plain words for older readers,
 * no em dashes, amounts only (no names or addresses are built in here).
 */

import { dollars } from './reversal-rules'

export interface Notice {
  subject: string
  text: string
}

export function residentBankPaymentFailed(input: {
  associationName: string
  totalCents: number
  returnedFeeCents: number
  afterPosting: boolean
  payUrl: string
}): Notice {
  const lines = [
    input.afterPosting
      ? `Your bank sent back your payment of ${dollars(input.totalCents)} to ${input.associationName}. The payment has been taken off your account, so the charges are due again.`
      : `Your bank payment of ${dollars(input.totalCents)} to ${input.associationName} did not go through. Nothing was taken from you.`,
  ]
  if (input.returnedFeeCents > 0) {
    lines.push(`Your association charges ${dollars(input.returnedFeeCents)} when a bank payment is returned. It has been added to your account.`)
  }
  lines.push(`You can pay again here: ${input.payUrl}`, 'If you think this is a mistake, please contact your board.')
  return { subject: 'Your bank payment did not go through', text: lines.join('\n\n') }
}

export function residentRefund(input: { associationName: string; refundedCents: number; full: boolean }): Notice {
  return {
    subject: input.full ? 'Your payment was refunded' : 'Part of your payment was refunded',
    text: [
      `${input.associationName} refunded ${dollars(input.refundedCents)} to you${input.full ? ', the full payment' : ''}.`,
      'It can take 5 to 10 business days to show on your statement. Your account balance has been updated.',
    ].join('\n\n'),
  }
}

export function boardBankPaymentReturned(input: { totalCents: number; returnedFeeCents: number; shortCents: number; reviewUrl: string }): Notice {
  const lines = [
    `A bank payment of ${dollars(input.totalCents)} was returned after it was posted. We took it off the home's account and the charges are open again.`,
  ]
  if (input.returnedFeeCents > 0) lines.push(`A returned payment fee of ${dollars(input.returnedFeeCents)} was added to the home.`)
  if (input.shortCents > 0) lines.push(`${dollars(input.shortCents)} of it had already been used as credit, so please review this home.`)
  lines.push(`Review it here: ${input.reviewUrl}`)
  return { subject: 'A bank payment was returned', text: lines.join('\n\n') }
}

export function boardRefundDone(input: { refundedCents: number; full: boolean; shortCents: number; reviewUrl: string }): Notice {
  const lines = [
    `${dollars(input.refundedCents)} was refunded${input.full ? ' (the full payment)' : ''} and the home's account was updated.`,
  ]
  if (input.shortCents > 0) lines.push(`${dollars(input.shortCents)} had already been used as credit, so please review this home.`)
  lines.push(`See it here: ${input.reviewUrl}`)
  return { subject: 'A payment was refunded', text: lines.join('\n\n') }
}

export function boardRefundFailed(input: { refundedCents: number; reviewUrl: string }): Notice {
  return {
    subject: 'A refund did not go through',
    text: [
      `A refund of ${dollars(input.refundedCents)} did not go through, so the amount is back on the home's balance.`,
      'Please check the payment in your Stripe dashboard and contact the resident.',
      `See the home's account here: ${input.reviewUrl}`,
    ].join('\n\n'),
  }
}

export function boardBooksNotOpen(input: { amountCents?: number }): Notice {
  const what = input.amountCents ? ` of ${dollars(input.amountCents)}` : ''
  return {
    subject: 'Open your accounting period so a payment change can be recorded',
    text: [
      `A payment change${what} could not be recorded because your accounting period is closed or not set up.`,
      'Please open the current fiscal period in Accounting within 3 days. The payment processor keeps trying until then, and after that this change will be lost from your books.',
    ].join('\n\n'),
  }
}

export function boardDisputeOpened(input: { amountCents: number; dueByIso: string | null; stripeUrl: string }): Notice {
  const by = input.dueByIso ? ` Send your evidence by ${input.dueByIso}.` : ' Send your evidence before the deadline in Stripe.'
  return {
    subject: 'A homeowner disputed a payment',
    text: [
      `A payment of ${dollars(input.amountCents)} was disputed with the homeowner's bank.${by}`,
      `Nothing has changed on the home's account yet. You answer the dispute in your Stripe dashboard: ${input.stripeUrl}`,
    ].join('\n\n'),
  }
}

export function boardDisputeLost(input: { amountCents: number; shortCents: number; reviewUrl: string }): Notice {
  const lines = [`The dispute over a payment of ${dollars(input.amountCents)} was lost. The payment was taken off the home's account and the charges are open again.`]
  if (input.shortCents > 0) lines.push(`${dollars(input.shortCents)} of it had already been used as credit, so please review this home.`)
  lines.push(`Review it here: ${input.reviewUrl}`)
  return { subject: 'A payment dispute was lost', text: lines.join('\n\n') }
}

export function boardDisputeWon(input: { amountCents: number }): Notice {
  return {
    subject: 'A payment dispute was won',
    text: `The dispute over a payment of ${dollars(input.amountCents)} was decided in your favor. The payment stands and nothing changed on the home's account.`,
  }
}
