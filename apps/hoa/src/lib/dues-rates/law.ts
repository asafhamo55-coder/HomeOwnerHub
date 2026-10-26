/**
 * BL-137: what the statute text in the repo says about changing dues.
 * Pure and client-safe. Citations as text, never legal advice.
 *
 * Only statute text kept in scripts/fixtures/state-law is quoted, and
 * law.test.ts checks every quote word for word against it.
 *
 * GEORGIA — ga-ocga-44-3-art6-2026.txt (Property Owners' Association Act,
 *   O.C.G.A. §§ 44-3-220 to 44-3-235; snapshot valid until 2027-07-01, with SB 406’s 2027 text as dated records).
 *   Read in full for assessments: Article 6 sets NO notice period, NO cap
 *   and NO owner vote for a change in assessments. What it does say:
 *   - § 44-3-235(a): the article applies only to property submitted to it.
 *   - § 44-3-230(a): owners get comprehensive reports of the finances and
 *     budget projections at the annual meeting (21 days' notice).
 *   - § 44-3-232.1(a)(5): while the DECLARANT controls the association,
 *     failing to prepare the budget, establish the annual assessment and
 *     distribute the budget and notice of assessment within 30 days after
 *     the fiscal year begins lets owners move to take control.
 *   - § 44-3-225(a): expenses may be specially assessed only "to the
 *     extent that the instrument expressly so provides" — the declaration
 *     decides how dues are shared.
 *   So for the notice itself: "check your governing documents".
 * FLORIDA — flsenate-ch720-2026.html:
 *   - § 720.303(2)(c)2: an assessment may not be levied at a board meeting
 *     unless the meeting notice says assessments will be considered
 *     (budget-adoption/law.ts FL_ASSESSMENT_STATEMENT), plus 14 days and
 *     posting for special assessments.
 *   - § 720.308(1)(a): assessments are the member's proportional share as
 *     the governing documents describe.
 *   No owner-notice period for the new amount is in ch. 720 → governing
 *   documents.
 * CALIFORNIA — ca-pubinfo-2025 (§ 5605, official pubinfo export):
 *   - § 5605(a): an annual increase needs the § 5300 budget report steps or
 *     member approval.
 *   - § 5605(b): more than 20% over last year's regular assessment needs
 *     member approval. The app checks the % change against this.
 *   § 5615 (the 30-to-60-day individual notice) is NOT in the fixtures →
 *   governing documents.
 * TEXAS — tcss-pr209-2026-excerpt.htm:
 *   - § 209.0058(a)(4): a member's vote on an increase in a regular
 *     assessment must be in writing and signed (when owners vote). § 209.0051
 *     (open meeting, notice) is NOT loaded → governing documents.
 * EVERY OTHER STATE: nothing quoted; "check your governing documents".
 */

import { FL_ASSESSMENT_STATEMENT } from '@/lib/budget-adoption/law'
import { FL_SPECIAL_ASSESSMENT, type StatuteCitation } from '@/lib/meetings/notice-law'

export type { StatuteCitation }

export const GA_APPLIES: StatuteCitation = {
  cite: 'O.C.G.A. § 44-3-235(a)',
  quote: 'This article shall apply to all property which is submitted to this article.',
}

export const GA_ANNUAL_REPORTS: StatuteCitation = {
  cite: 'O.C.G.A. § 44-3-230(a)',
  quote:
    'At the annual meeting, comprehensive reports of the affairs, finances, and budget projections of the association shall be made to the lot owners.',
}

export const GA_DECLARANT_BUDGET: StatuteCitation = {
  cite: 'O.C.G.A. § 44-3-232.1(a)(5)',
  quote:
    'Prepare an annual operating budget, establish the annual assessment, and distribute such budget and notice of assessment to the owners in accordance with the condominium instruments no later than 30 days after the beginning of the association’s fiscal year',
}

export const GA_INSTRUMENT_SHARES: StatuteCitation = {
  cite: 'O.C.G.A. § 44-3-225(a)',
  quote: 'To the extent that the instrument expressly so provides:',
}

export const FL_PROPORTIONAL_SHARE: StatuteCitation = {
  cite: 'Fla. Stat. § 720.308(1)(a)',
  quote:
    'Assessments levied pursuant to the annual budget or special assessment must be in the member’s proportional share of expenses as described in the governing document',
}

export const CA_INCREASE_STEPS: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5605(a)',
  quote:
    'Annual increases in regular assessments for any fiscal year shall not be imposed unless the board has complied with paragraphs (1), (2), (4), (5), (6), (7), and (8) of subdivision (b) of Section 5300 with respect to that fiscal year, or has obtained the approval of a majority of a quorum of members, pursuant to Section 4070, at a member meeting or election.',
}

export const CA_INCREASE_CAP: StatuteCitation = {
  cite: 'Cal. Civ. Code § 5605(b)',
  quote:
    'Notwithstanding more restrictive limitations placed on the board by the governing documents, the board may not impose a regular assessment that is more than 20 percent greater than the regular assessment for the association’s preceding fiscal year or impose special assessments which in the aggregate exceed 5 percent of the budgeted gross expenses of the association for that fiscal year without the approval of a majority of a quorum of members, pursuant to Section 4070, at a member meeting or election.',
}

export const TX_WRITTEN_BALLOT: StatuteCitation = {
  cite: 'Tex. Prop. Code § 209.0058(a)(4)',
  quote: 'on a proposed increase in the amount of a regular assessment or the proposed adoption of a special assessment',
}

export { FL_ASSESSMENT_STATEMENT, FL_SPECIAL_ASSESSMENT }

/** Every quote the dues-rate screens can show — what law.test.ts checks. */
export const ALL_RATE_CITATIONS: readonly StatuteCitation[] = [
  GA_APPLIES,
  GA_ANNUAL_REPORTS,
  GA_DECLARANT_BUDGET,
  GA_INSTRUMENT_SHARES,
  FL_ASSESSMENT_STATEMENT,
  FL_SPECIAL_ASSESSMENT,
  FL_PROPORTIONAL_SHARE,
  CA_INCREASE_STEPS,
  CA_INCREASE_CAP,
  TX_WRITTEN_BALLOT,
]

/** § 5605(b), in percent. */
export const CA_REGULAR_CAP_PCT = 20

export const CHECK_GOVERNING_DOCS =
  'HomeownerHub doesn’t have your state’s rule for a dues change loaded. Check your declaration and bylaws (and ask your association’s attorney) for how much notice owners get and whether owners must vote.'

export const NOT_LEGAL_ADVICE = 'General information, not legal advice.'

export type RateJurisdiction = 'GA' | 'FL' | 'CA' | 'TX' | 'generic'

export function rateJurisdiction(state: string | null | undefined): RateJurisdiction {
  const s = (state ?? '').trim().toUpperCase()
  if (s === 'GA' || s === 'GEORGIA') return 'GA'
  if (s === 'FL' || s === 'FLORIDA') return 'FL'
  if (s === 'CA' || s === 'CALIFORNIA') return 'CA'
  if (s === 'TX' || s === 'TEXAS') return 'TX'
  return 'generic'
}

export type FindingTone = 'info' | 'warn'

export interface RateFinding {
  tone: FindingTone
  text: string
  citations: StatuteCitation[]
}

export interface RateRules {
  jurisdiction: RateJurisdiction
  findings: RateFinding[]
}

/**
 * What the board should know before a dues change takes effect.
 * `pct` is the change in the yearly amount (null for a first rate).
 */
export function rateChangeRules(state: string | null | undefined, pct: number | null): RateRules {
  const j = rateJurisdiction(state)
  const increase = pct !== null && pct > 0
  const findings: RateFinding[] = []
  switch (j) {
    case 'GA':
      findings.push(
        {
          tone: 'info',
          text: 'Georgia’s Property Owners’ Association Act (as loaded) sets no notice period, no cap and no owner vote for a change in dues. Your declaration and bylaws decide those. The Act applies only if your declaration submits the community to it.',
          citations: [GA_APPLIES, GA_INSTRUMENT_SHARES],
        },
        {
          tone: 'info',
          text: 'At the annual meeting the board must report the association’s finances and budget projections to owners, so present the new rate there too.',
          citations: [GA_ANNUAL_REPORTS],
        },
        {
          tone: 'info',
          text: 'While the developer still controls the association, the budget and a notice of the annual assessment must go to owners within 30 days after the fiscal year begins.',
          citations: [GA_DECLARANT_BUDGET],
        },
      )
      break
    case 'FL':
      findings.push(
        {
          tone: increase ? 'warn' : 'info',
          text: 'Adopt the new rate at a board meeting whose notice says assessments will be considered and what they are. Special assessments need 14 days’ written notice and posting on the property.',
          citations: [FL_ASSESSMENT_STATEMENT, FL_SPECIAL_ASSESSMENT],
        },
        {
          tone: 'info',
          text: 'Each owner’s share must follow the governing documents. Chapter 720 (as loaded) sets no separate notice period for telling owners the new amount; check your governing documents.',
          citations: [FL_PROPORTIONAL_SHARE],
        },
      )
      break
    case 'CA': {
      const overCap = pct !== null && pct > CA_REGULAR_CAP_PCT
      findings.push({
        tone: overCap ? 'warn' : 'info',
        text: overCap
          ? `This is more than ${CA_REGULAR_CAP_PCT}% over the current rate. A regular assessment more than ${CA_REGULAR_CAP_PCT}% above last fiscal year’s needs the approval of a majority of a quorum of members.`
          : `A regular assessment more than ${CA_REGULAR_CAP_PCT}% above last fiscal year’s needs the approval of a majority of a quorum of members. Any increase also needs the § 5300 budget report steps done for that year, or member approval.`,
        citations: overCap ? [CA_INCREASE_CAP, CA_INCREASE_STEPS] : [CA_INCREASE_STEPS, CA_INCREASE_CAP],
      })
      findings.push({
        tone: 'info',
        text: 'California’s notice rule for an increase (Civ. Code § 5615) isn’t loaded in HomeownerHub. Check your governing documents for how far ahead to tell owners.',
        citations: [],
      })
      break
    }
    case 'TX':
      findings.push(
        {
          tone: 'info',
          text: 'If owners vote on the increase, each vote must be in writing and signed (an electronic vote counts).',
          citations: [TX_WRITTEN_BALLOT],
        },
        {
          tone: 'info',
          text: 'Texas’s open-meeting and notice rule (Prop. Code § 209.0051) isn’t loaded in HomeownerHub. Check your governing documents for how to adopt and announce the new rate.',
          citations: [],
        },
      )
      break
    default:
      findings.push({ tone: 'info', text: CHECK_GOVERNING_DOCS, citations: [] })
  }
  return { jurisdiction: j, findings }
}
