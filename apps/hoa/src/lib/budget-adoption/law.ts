/**
 * BL-138: what the law in the repo says about adopting a budget. Pure and
 * client-safe. Citations as text, never legal advice.
 *
 * Only statute text kept in scripts/fixtures/state-law is quoted, and
 * law.test.ts checks every quote word for word against it:
 *
 * FLORIDA — flsenate-ch720-2026.html (the Florida Senate's 2026 ch. 720):
 *   - § 720.303(2)(c)2, first sentence: no assessment may be levied at a
 *     board meeting unless the notice says assessments will be considered
 *     and their nature.
 *   - § 720.303(2)(c)2, second sentence: 14 days' written notice plus
 *     posting when special assessments are considered (the same quote as
 *     lib/meetings/notice-law.ts FL_SPECIAL_ASSESSMENT, reused from there).
 *   - § 720.303(2)(c)1: the ordinary board-meeting notice, 48 hours posted
 *     or 7 days mailed (reused from notice-law.ts).
 *   - § 720.303(6)(a): a copy of the budget, or notice that one is
 *     available at no charge, to each member.
 * CALIFORNIA — ca-civ-davis-stirling-2026.txt:
 *   - § 5300(a): the annual budget report goes out 30 to 90 days before
 *     the end of the fiscal year. The board-meeting notice period (§ 4920)
 *     is NOT in the fixture, so for the meeting itself: "check your
 *     governing documents".
 * EVERY OTHER STATE: nothing quoted; "check your governing documents".
 */

import {
  FL_BOARD_DELIVERED,
  FL_BOARD_POSTED,
  FL_SPECIAL_ASSESSMENT,
  type StatuteCitation,
} from '@/lib/meetings/notice-law'

export type { StatuteCitation }
export { FL_BOARD_DELIVERED, FL_BOARD_POSTED, FL_SPECIAL_ASSESSMENT }

export const FL_ASSESSMENT_STATEMENT: StatuteCitation = {
  cite: 'Fla. Stat. § 720.303(2)(c)2',
  quote:
    'An assessment may not be levied at a board meeting unless the notice of the meeting includes a statement that assessments will be considered and the nature of the assessments.',
}

export const FL_BUDGET_COPY: StatuteCitation = {
  cite: 'Fla. Stat. § 720.303(6)(a)',
  quote:
    'The association shall provide each member with a copy of the annual budget or a written notice that a copy of the budget is available upon request at no charge to the member.',
}

export const CA_BUDGET_REPORT: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5300(a)',
  quote:
    'Notwithstanding a contrary provision in the governing documents, an association shall distribute an annual budget report 30 to 90 days before the end of its fiscal year.',
}

/** Every quote this kit can show — what law.test.ts checks against the fixtures. */
export const ALL_ADOPTION_CITATIONS: readonly StatuteCitation[] = [
  FL_ASSESSMENT_STATEMENT,
  FL_SPECIAL_ASSESSMENT,
  FL_BOARD_POSTED,
  FL_BOARD_DELIVERED,
  FL_BUDGET_COPY,
  CA_BUDGET_REPORT,
]

/** § 720.303(2)(c)1 and (2)(c)2, in days before the meeting. */
export const FL_NOTICE_DAYS = { posted: 2, mailed: 7, special: 14 } as const

export const CHECK_GOVERNING_DOCS =
  'HomeownerHub doesn’t have your state’s rule for this loaded. Check your governing documents (and ask your association’s attorney) for how and when to do it.'

export const CA_MEETING_NOTICE_NOT_LOADED =
  'California’s board-meeting notice period isn’t loaded in HomeownerHub. Check your governing documents for how far ahead to send it.'

export const NOT_LEGAL_ADVICE = 'General information, not legal advice.'
