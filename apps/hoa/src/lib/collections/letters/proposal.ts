// A drafted collections letter waiting on the board (BL-089), as an
// approval_requests row (migration 0060, no new table).
//
//   action_type   collections.letter
//   subject_type  collections_letter
//   subject_id    a fresh id per letter, so the live-subject unique index
//                 never blocks the next letter on the same case
//   payload       LetterPayload below: ids, the board's BLANK entries,
//                 and the figures in cents
//
// Approving runs executor.ts (re-checks the case is still open) and the
// row becomes 'posted'. Printing is allowed only from a posted row, and
// only while the account still matches the approved figures.
//
// Pure: zod and relative imports only, so the approvals inbox (which
// tests/integration loads without the `@/` alias) can read it.

import { z } from 'zod'
import { propertyHref } from '../../properties/href'
import type { PropertyId } from '../../properties/resolve'

export const LETTER_ACTION = 'collections.letter'
export const LETTER_WORKFLOW = 'collections_letters'
export const LETTER_SUBJECT = 'collections_letter'

/** Mirrors LETTER_KINDS in model.ts (kept here so this file needs no `@/` imports). */
const KINDS = ['past_due', 'fl_late_notice', 'fl_intent_to_lien', 'ca_pre_lien', 'tx_delinquency'] as const

const Iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const LetterPayloadSchema = z.object({
  version: z.literal(1),
  kind: z.enum(KINDS),
  jurisdiction: z.enum(['FL', 'CA', 'TX', 'generic']),
  caseId: z.string().uuid(),
  propertyId: z.string().uuid(),
  unitId: z.string().uuid().nullable(),
  draftedOn: Iso,
  /** The board's entries for the BLANKs, by field key. */
  values: z.record(z.string(), z.string().max(1000)),
  /** The charges the figures come from, sorted. */
  chargeIds: z.array(z.string()).max(2000),
  ledgerCents: z.number().int(),
  enteredCents: z.number().int().min(0),
  totalCents: z.number().int().positive(),
})
export type LetterPayload = z.infer<typeof LetterPayloadSchema>

export function readLetterPayload(raw: unknown): LetterPayload | null {
  const parsed = LetterPayloadSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export const LETTER_KIND_LABELS: Record<LetterPayload['kind'], string> = {
  past_due: 'Past-due letter',
  fl_late_notice: 'Notice of late assessment',
  fl_intent_to_lien: 'Notice of intent to record a claim of lien',
  ca_pre_lien: 'Pre-lien notice',
  tx_delinquency: 'Delinquency notice',
}

export const LETTER_KIND_CITATIONS: Record<LetterPayload['kind'], string | null> = {
  past_due: null,
  fl_late_notice: 'Fla. Stat. § 720.3085(3)(d)',
  fl_intent_to_lien: 'Fla. Stat. § 720.3085(4)',
  ca_pre_lien: 'Cal. Civ. Code § 5660',
  tx_delinquency: 'Tex. Prop. Code § 209.0064',
}

/** "Notice of late assessment — 14 Oak Lane": the row's summary. */
export function letterSummary(kind: LetterPayload['kind'], home: string): string {
  return `${LETTER_KIND_LABELS[kind]} — ${home || 'a home'}`.slice(0, 300)
}

/** The page the letter is reviewed and printed from. */
export function letterHref(propertyId: string): string {
  return propertyHref(propertyId as PropertyId, { collectionsLetter: true })
}
