/**
 * BL-101 A2 — a home's account as citable fragments for W32.
 *
 * Each fact is its own fragment with its own refId, so `validateCitations`
 * checks a quoted figure the same way it checks a CC&R quote: "$412.50"
 * in a draft must be a literal substring of the ledger line it cites.
 *
 * Only called after the disclosure gate (account-context.ts) has verified
 * that the sender is a resident of this home. Pure: no database, no logs.
 *
 * Free text another person wrote (a ticket subject, an ARC summary) passes
 * through redactContactPII first — BL-062, no contact details to the model.
 */

import { redactContactPII } from '@homeowner-portal/ai/pii'
import type { HomeAccount } from '@/lib/inbox/account-context'
import { cureDate } from '@/lib/inbox/account-context'
import type { RetrievedFragment } from './retrieve'

const dollars = (cents: number): string => `$${(cents / 100).toFixed(2)}`
const day = (iso: string | null | undefined): string | null => (iso ? iso.slice(0, 10) : null)
const words = (s: string): string => s.replace(/_/g, ' ')

function fragment(refId: string, label: string, text: string): RetrievedFragment {
  return { refId, sourceType: 'property', label, text }
}

/**
 * Fragments, plus the parts that could not be stated (named in W32's
 * UNAVAILABLE list so an absent balance is never read as a zero one).
 */
export function buildAccountFragments(home: HomeAccount): { fragments: RetrievedFragment[]; degraded: string[] } {
  const fragments: RetrievedFragment[] = []
  const degraded: string[] = []

  const a = home.account
  if (!a) {
    degraded.push('account_ledger')
  } else if (a.truncated) {
    // A capped ledger would understate the balance. Say nothing rather
    // than a figure that could be wrong.
    degraded.push('account_ledger')
  } else {
    const pastDue = a.pastDueCount > 0 ? `, ${a.pastDueCount} of them past due` : ''
    const next = a.nextDueDate ? ` Earliest due date: ${a.nextDueDate}.` : ''
    fragments.push(
      fragment(
        'acct:balance',
        'Account — balance',
        a.openChargeCount === 0
          ? `Balance owed: ${dollars(0)}. No open charges as of ${a.today}.`
          : `Balance owed: ${dollars(a.balanceCents)} across ${a.openChargeCount} open charge${a.openChargeCount === 1 ? '' : 's'}${pastDue}, as of ${a.today}.${next}`,
      ),
    )
    a.openCharges.forEach((c, i) => {
      fragments.push(
        fragment(
          `acct:charge:${i + 1}`,
          'Account — open charge',
          `${c.type}: ${dollars(c.amountCents)} due ${c.dueDate}, ${c.pastDue ? 'past due' : 'not yet due'}.`,
        ),
      )
    })
    if (a.lastPayment) {
      fragments.push(
        fragment(
          'acct:last_payment',
          'Account — last payment',
          `Last payment received: ${dollars(a.lastPayment.amountCents)} on ${a.lastPayment.date}.`,
        ),
      )
    }
  }

  if (home.plan.visible) {
    const p = home.plan.plan
    fragments.push(
      fragment(
        'acct:plan',
        'Account — payment plan',
        `Payment plan (${words(p.status)}): ${p.installments} installments of ${dollars(p.installmentCents)}, ${dollars(p.totalCents)} in total, starting ${p.startDate}.`,
      ),
    )
  }

  const r = home.requests
  if (!r) {
    degraded.push('account_requests')
  } else {
    for (const v of r.violationsOnMyHome) {
      const notice = v.noticeSentAt ? ` Notice sent ${day(v.noticeSentAt)}.` : ''
      const cure = cureDate(v.noticeSentAt, v.curePeriodDays)
      fragments.push(
        fragment(
          `acct:violation:${v.id}`,
          'Violation record',
          `Violation on this home: ${words(v.type)}, status ${words(v.status)}.${notice}${cure ? ` Cure by ${cure}.` : ''}`,
        ),
      )
    }
    for (const x of r.arcApplications) {
      const decided = x.decidedAt ? ` Decided ${day(x.decidedAt)}.` : ''
      fragments.push(
        fragment(
          `acct:arc:${x.id}`,
          'ARC application',
          `ARC application "${redactContactPII(x.summary)}" (${words(x.category)}): status ${words(x.status)}, submitted ${day(x.submittedAt)}.${decided}`,
        ),
      )
    }
    for (const t of r.tickets) {
      fragments.push(
        fragment(
          `acct:ticket:${t.id}`,
          'Maintenance request',
          `Request "${redactContactPII(t.subject)}" (${words(t.category)}): status ${words(t.status)}, opened ${day(t.createdAt)}.`,
        ),
      )
    }
  }

  return { fragments, degraded }
}
