/**
 * BL-032: the collections letter as plain blocks, for the mailed PDF. Pure.
 *
 * This mirrors LetterDocument in
 * app/(dashboard)/properties/[id]/collections-letter/CollectionsLetter.tsx
 * (the on-screen and browser-print letter) and reads the same model, law
 * text and figures, so the mailed copy and the printed copy say the same
 * thing. If one changes, change the other (letter-doc.test.ts pins the
 * totals and the law text so a drift shows).
 */

import { formatDay } from '@/lib/money/format'
import { valueOf, type FieldValues } from '@/lib/properties/estoppel/model'
import {
  CA_IMPORTANT_NOTICE,
  CA_RIGHTS,
  FL_INTENT_BODY,
  FL_LATE_NOTICE_BODY,
  GA_CONDO_PRE_FORECLOSURE_BODY,
  GA_CONDO_PRE_FORECLOSURE_QUOTES,
  GA_FEE_NOTICE_BODY,
  GA_FEE_NOTICE_QUOTES,
  TX_CURE_DAYS,
  gaForeclosureLaw,
} from '@/lib/collections/letters/law'
import { dueDatesLabel, letterTotals, usdCents, type Letter, type LetterInput } from '@/lib/collections/letters/model'

export type DocBlock =
  | { kind: 'text'; text: string; bold?: boolean; size?: number; muted?: boolean }
  | { kind: 'rows'; rows: Array<{ label: string; amount: string; bold?: boolean }>; small?: boolean }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'gap'; height: number }

const BLANK = (label: string) => `[[BLANK: ${label}]]`

export function letterDocument(letter: Letter, input: LetterInput, values: FieldValues): DocBlock[] {
  const f = letter.figures
  const k = letter.kind
  const field = (key: string) => letter.fields.find((x) => x.key === key)
  const val = (key: string): string => {
    const fd = field(key)
    if (!fd) return ''
    return valueOf(fd, values) ?? BLANK(fd.label)
  }
  const totals = letterTotals(letter, values)
  const association = (field('associationName') ? valueOf(field('associationName')!, values) : null) ?? BLANK('Association name')
  const home = [input.address, input.unitNumber ? `Unit ${input.unitNumber}` : null].filter(Boolean).join(', ')
  const isFl = k === 'fl_late_notice' || k === 'fl_intent_to_lien'
  const isGaForeclosure = k === 'ga_pre_foreclosure' || k === 'ga_condo_pre_foreclosure'
  const entered = (key: string): string => val(key)
  const out: DocBlock[] = []
  const text = (t: string, o: Partial<Extract<DocBlock, { kind: 'text' }>> = {}) => out.push({ kind: 'text', text: t, ...o })

  text(association, { bold: true })
  text(formatDay(letter.letterDate), { muted: true })
  out.push({ kind: 'gap', height: 6 })
  text(val('owners'))
  if (isGaForeclosure) {
    text(val('lotAddress'))
    text(`Also sent to: ${val('designatedAddress')}`, { muted: true })
  } else {
    text(val('mailingAddress'))
  }
  out.push({ kind: 'gap', height: 8 })
  text(letter.meta.title, { bold: true, size: 14 })
  if (isFl) {
    text(`RE: ${k === 'fl_intent_to_lien' ? 'Parcel or (lot/block) ' : 'Parcel '}${val('parcel')} of ${association}${home ? ` (${home})` : ''}`)
  } else {
    text(`RE: ${home || 'Your home'}`)
  }

  if (k === 'fl_late_notice') text(FL_LATE_NOTICE_BODY(association))
  if (k === 'fl_intent_to_lien') text(FL_INTENT_BODY(association))
  if (k === 'ca_pre_lien') {
    text(
      'Before the association records a lien on your separate interest to collect a debt that is past due under Civil Code § 5650, Civil Code § 5660 requires this notice. The association’s collection and lien enforcement procedures, and how the amount below is calculated:',
    )
    text(val('procedures'))
    text(CA_IMPORTANT_NOTICE.toUpperCase(), { bold: true, size: 14 })
  }
  if (k === 'tx_delinquency') {
    text('The association’s records show the following delinquent amounts on your account. This notice is given under Texas Property Code § 209.0064.')
  }
  if (k === 'ga_fee_notice') text(GA_FEE_NOTICE_BODY(association))
  if (k === 'ga_pre_foreclosure') text(gaForeclosureLaw(letter.letterDate).body(association))
  if (k === 'ga_condo_pre_foreclosure') text(GA_CONDO_PRE_FORECLOSURE_BODY(association))
  if (k === 'past_due') text('Our records show the following amounts past due on your account.')

  const totalLabel = isFl ? 'TOTAL OUTSTANDING' : k === 'tx_delinquency' ? 'Total amount required to make the account current' : 'Total owed'
  const totalRow = { label: totalLabel, amount: totals.totalCents === null ? BLANK('Total') : usdCents(totals.totalCents), bold: true }
  const accountCredit = input.unappliedCreditCents ?? 0
  const creditRows =
    accountCredit > 0 && totals.totalCents !== null
      ? [
          { label: 'Credit on account, not applied to a charge', amount: usdCents(accountCredit) },
          { label: 'Total due after credit', amount: usdCents(totals.totalCents - accountCredit), bold: true },
        ]
      : []
  const paymentsRow = f.creditCents !== 0 ? [{ label: 'Less payments and credits not applied to a charge', amount: usdCents(f.creditCents) }] : []
  const lineRows = (lines: typeof f.assessmentLines) =>
    lines.map((l) => ({ label: `${l.label}, due ${formatDay(l.dueDate)}`, amount: usdCents(l.remainingCents) }))
  const sorted = (lines: typeof f.assessmentLines) => [...lines].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id))

  if (isFl) {
    out.push({
      kind: 'rows',
      rows: [
        { label: `Maintenance due (${dueDatesLabel(f.assessmentLines)})`, amount: usdCents(f.assessmentsCents) },
        { label: 'Late fee, if applicable', amount: usdCents(f.lateFeesCents) },
        ...paymentsRow,
        { label: `Interest through (${val('interestThrough')}) *`, amount: entered('interest') },
        ...(k === 'fl_intent_to_lien'
          ? [
              { label: 'Certified mail charges', amount: entered('certifiedMail') },
              { label: 'Other costs', amount: entered('otherCosts') },
            ]
          : []),
        totalRow,
        ...creditRows,
      ],
    })
  } else if (k === 'ca_pre_lien') {
    out.push({
      kind: 'rows',
      rows: [
        { label: `Delinquent assessments (${dueDatesLabel(f.assessmentLines)})`, amount: usdCents(f.assessmentsCents) },
        { label: 'Late charges', amount: usdCents(f.lateFeesCents) },
        { label: 'Fees and reasonable costs of collection', amount: entered('collectionCosts') },
        { label: 'Reasonable attorney’s fees', amount: entered('attorneyFees') },
        { label: 'Interest', amount: entered('interest') },
        ...paymentsRow,
        totalRow,
        ...creditRows,
      ],
    })
  } else {
    out.push({
      kind: 'rows',
      rows: [
        ...lineRows(sorted([...f.assessmentLines, ...f.lateFeeLines, ...f.otherLines])),
        ...(isGaForeclosure ? [{ label: 'Interest', amount: entered('interest') }] : []),
        ...paymentsRow,
        totalRow,
        ...creditRows,
      ],
    })
  }

  if (isFl) text(`*Interest accrues at the rate of ${val('interestRate')} percent per annum.`)
  if (k === 'ca_pre_lien') text(`Interest rate: ${val('interestRate')} percent per year.`)
  if (isFl || k === 'ca_pre_lien') {
    text('Itemized charges', { bold: true })
    out.push({ kind: 'rows', small: true, rows: lineRows(sorted([...f.assessmentLines, ...f.lateFeeLines])) })
  }
  if (k === 'ca_pre_lien') out.push({ kind: 'bullets', items: CA_RIGHTS.map((r) => r.text) })
  if (k === 'tx_delinquency') {
    text('Options to avoid having your account turned over to a collection agent', { bold: true })
    text(val('paymentPlan'))
    text(`You have ${TX_CURE_DAYS} days to cure the delinquency before further collection action is taken: until ${letter.deadline ? formatDay(letter.deadline.day) : '-'}.`)
  }
  if (isGaForeclosure) text(`Interest accrues at the rate of ${val('interestRate')} percent per year.`)
  if (k === 'ga_fee_notice') {
    text('Itemized list of reasonable attorney’s fees claimed', { bold: true })
    text(val('attorneyFees'))
  }
  if (k === 'ga_fee_notice' || k === 'ga_pre_foreclosure' || k === 'ga_condo_pre_foreclosure') {
    const quotes =
      k === 'ga_fee_notice' ? GA_FEE_NOTICE_QUOTES : k === 'ga_condo_pre_foreclosure' ? GA_CONDO_PRE_FORECLOSURE_QUOTES : gaForeclosureLaw(letter.letterDate).quotes
    text('What the law says', { bold: true, size: 10 })
    for (const q of quotes) text(`${q.cite}: “${q.quote}”`, { size: 9, muted: true })
  }
  if (k === 'past_due') {
    text(
      `Please pay the total by ${val('payBy')}. If you have already paid, thank you, and please disregard this letter. If you would like to discuss a payment plan, contact the association.`,
    )
  }

  out.push({ kind: 'gap', height: 10 })
  text('Sincerely,', { muted: true })
  out.push({ kind: 'gap', height: 28 })
  text(val('signer'))
  text(association, { muted: true })
  return out
}

/** Any [[BLANK: ...]] left in the document. The send path refuses a letter with one. */
export function blanksLeft(blocks: DocBlock[]): string[] {
  const found: string[] = []
  const scan = (s: string) => {
    for (const m of s.matchAll(/\[\[BLANK: ([^\]]*)\]\]/g)) found.push(m[1] ?? '')
  }
  for (const b of blocks) {
    if (b.kind === 'text') scan(b.text)
    else if (b.kind === 'rows') b.rows.forEach((r) => (scan(r.label), scan(r.amount)))
    else if (b.kind === 'bullets') b.items.forEach(scan)
  }
  return found
}
