// W3 — statute-aware violation letters (BL-019).
//
// Pure module: no database, no network, no model. Each state's
// enforcement rules live here in code (no migration); W3 selects the set
// for the association's stored `associations.state`, refuses a requested
// step the set forbids, and appends deterministic notice language to the
// model's draft. The board-facing UI imports `selectStateRules` from here
// (`@homeowner-portal/workflows/W3-state-rules`) so the page and the letter
// can never disagree about what the law says.
//
// Sources and how far each one is verified:
//
//   FL — Fla. Stat. § 720.305 (2026 edition), checked line by line against
//        the official flsenate.gov text recorded in
//        scripts/fixtures/state-law/flsenate-ch720-2026.html. Every quote
//        below is a verbatim substring of that text, enforced by
//        state-rules.test.ts AND re-validated at draft time against the
//        ingested `state_statutes` body with the W32 validator. A quote the
//        stored text no longer contains (the section was amended) is
//        dropped, never paraphrased.
//
//   CA — Civil Code §§ 5850 / 5855 as amended by AB 130 (2025). The
//        official site (leginfo.legislature.ca.gov) refused our fetch
//        (HTTP 403) when this was written, so the rules are encoded from
//        secondary summaries, carry "verify against the statute" wording,
//        and quote NOTHING. `textVerified: false` says so to the UI.
//
//   Everything else — generic "verify against your state's statute"
//        wording, no refusals: we do not pretend to know a law we have not
//        encoded.

import { z } from 'zod'
import { validateCitations } from '../W32-reply-drafter/tools'

// ─── Requested action (what the board is asking W3 to draft) ─────────

export const RequestedStepSchema = z.enum([
  /** Courtesy / first notice of a violation. Proposes nothing binding. */
  'first_notice',
  /** Notice of the owner's right to a hearing before a fine/suspension. */
  'hearing_notice',
  /** Letter imposing a fine. */
  'impose_fine',
  /** Letter imposing a suspension of common-area use rights. */
  'impose_suspension',
])
export type RequestedStep = z.infer<typeof RequestedStepSchema>

export const RequestedActionSchema = z.object({
  step: RequestedStepSchema.default('first_notice'),
  /** The fine the board wants to propose or impose, per violation. */
  fineAmountCents: z.number().int().min(0).max(100_000_000).optional(),
  /** Days between the hearing notice and the hearing. */
  hearingNoticeDays: z.number().int().min(0).max(365).optional(),
  /** A hearing has been held and the penalty approved there (FL: by the
   *  independent committee's majority vote; CA: by the board after notice). */
  hearingHeld: z.boolean().optional(),
  /** The violation has been cured. */
  violationCured: z.boolean().optional(),
  /** CA: the board made a written health/safety finding at an open meeting. */
  healthSafetyFinding: z.boolean().optional(),
  /** The board wants a late fee or interest charged on the fine. */
  lateFeeOrInterestOnFine: z.boolean().optional(),
})
export type RequestedAction = z.input<typeof RequestedActionSchema>

// ─── Rule sets ───────────────────────────────────────────────────────

export type RuleJurisdiction = 'FL' | 'CA' | 'OTHER'

export interface StatuteQuoteSpec {
  /** The fragment refId the W32 validator resolves the quote against. */
  refId: string
  citation: string
  /** Subsection/paragraph, e.g. '(2)(b)'. */
  pinpoint: string
  /** Verbatim statute text. */
  quote: string
  sourceUrl: string
  /** Steps whose letter includes this quote. */
  steps: readonly RequestedStep[]
}

export interface StateRuleSet {
  jurisdiction: RuleJurisdiction
  /** The association's stored state, normalised to a 2-letter code when
   *  recognisable, else as stored (trimmed); null when unset. */
  state: string | null
  /** Short heading for the board, e.g. 'Florida — Fla. Stat. § 720.305'. */
  title: string
  /** The statute the rules come from; null for generic rules. */
  citation: string | null
  sourceUrl: string | null
  /** True only when every rule was checked against official text. */
  textVerified: boolean
  hearingNoticeDays: number | null
  hearingRequiredBeforeFine: boolean
  cureBarsFine: boolean
  fineCapCents: number | null
  /** What lets an association exceed `fineCapCents`. */
  fineCapOverride: 'governing_documents' | 'health_safety_finding' | null
  lateFeesOnFinesForbidden: boolean
  /** Plain-language bullets the board sees beside the draft. */
  summary: string[]
  /** Paragraph appended to every letter for this state. */
  noticeLanguage: string
  /** Verbatim quotes, validated before use. Empty for unverified states. */
  quotes: readonly StatuteQuoteSpec[]
  /** Shown when the rules are not verified against official text. */
  verifyNote: string | null
}

const FL_CITATION = 'Fla. Stat. § 720.305'
const FL_SOURCE_URL = 'https://www.flsenate.gov/Laws/Statutes/2026/720.305'
const FL_REF_ID = 'law:FL:720.305'

/** Verbatim from the official 2026 text (curly apostrophes included). */
export const FL_720_305_QUOTES: readonly StatuteQuoteSpec[] = [
  {
    refId: FL_REF_ID,
    citation: FL_CITATION,
    pinpoint: '(2)(b)',
    quote:
      'A fine or suspension levied by the board of administration may not be imposed unless the board first provides at least 14 days’ written notice of the parcel owner’s right to a hearing',
    sourceUrl: FL_SOURCE_URL,
    steps: ['first_notice', 'hearing_notice', 'impose_fine', 'impose_suspension'],
  },
  {
    refId: FL_REF_ID,
    citation: FL_CITATION,
    pinpoint: '(2)(e)',
    quote:
      'If a violation has been cured before the hearing or in the manner specified in the written notice required in paragraph (b) or paragraph (d), a fine or suspension may not be imposed.',
    sourceUrl: FL_SOURCE_URL,
    steps: ['first_notice', 'hearing_notice', 'impose_fine', 'impose_suspension'],
  },
  {
    refId: FL_REF_ID,
    citation: FL_CITATION,
    pinpoint: '(2)(f)',
    quote:
      'the committee must set a date by which the fine must be paid, which date must be at least 30 days after delivery of the written notice required in paragraph (d)',
    sourceUrl: FL_SOURCE_URL,
    steps: ['impose_fine'],
  },
]

const CA_VERIFY =
  'California rules are summarised from Civil Code §§ 5850 and 5855 as amended by AB 130 (2025). The official text could not be retrieved, so verify against the statute before sending.'

const FLORIDA: Omit<StateRuleSet, 'state'> = {
  jurisdiction: 'FL',
  title: `Florida — ${FL_CITATION}`,
  citation: FL_CITATION,
  sourceUrl: FL_SOURCE_URL,
  textVerified: true,
  hearingNoticeDays: 14,
  hearingRequiredBeforeFine: true,
  cureBarsFine: true,
  fineCapCents: 10_000,
  fineCapOverride: 'governing_documents',
  lateFeesOnFinesForbidden: false,
  summary: [
    'A fine or suspension needs at least 14 days’ written notice of the owner’s right to a hearing (§ 720.305(2)(b)).',
    'The hearing is held within 90 days, before a committee of at least three members who are not officers, directors or employees (or their relatives). The owner may attend by phone or video.',
    'No fine or suspension unless the committee approves it by majority vote (§ 720.305(2)(c)).',
    'If the violation is cured before the hearing, or as the notice specifies, no fine or suspension may be imposed (§ 720.305(2)(e)).',
    'Fines are capped at $100 per violation and $1,000 in total for a continuing violation, unless the governing documents provide otherwise (§ 720.305(2)).',
    'No fine or suspension for bins left at the curb within 24 hours of collection, or holiday lights left up less than a week after written notice (§ 720.305(7)).',
  ],
  noticeLanguage:
    'Florida law (Fla. Stat. § 720.305) applies to this notice. The association may not impose a fine or suspension unless it first gives you at least 14 days’ written notice of your right to a hearing before a committee of at least three members who are not officers, directors, or employees of the association. You may attend that hearing by telephone or other electronic means. If you cure the violation before the hearing, or in the manner specified in the notice, no fine or suspension may be imposed.',
  quotes: FL_720_305_QUOTES,
  verifyNote: null,
}

const CALIFORNIA: Omit<StateRuleSet, 'state'> = {
  jurisdiction: 'CA',
  title: 'California — Civ. Code §§ 5850, 5855 (AB 130)',
  citation: 'Cal. Civ. Code §§ 5850, 5855',
  sourceUrl: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=5850.',
  textVerified: false,
  hearingNoticeDays: 10,
  hearingRequiredBeforeFine: true,
  cureBarsFine: true,
  fineCapCents: 10_000,
  fineCapOverride: 'health_safety_finding',
  lateFeesOnFinesForbidden: true,
  summary: [
    'Before imposing discipline, the board gives written notice at least 10 days before the meeting where it will be considered, with a chance to be heard (§ 5855).',
    'A fine may not exceed $100 per violation, unless the board makes a written finding at an open meeting that the violation may adversely affect health or safety (§ 5850, AB 130).',
    'No late fees or interest may be charged on a fine (AB 130).',
    'If the owner cures the violation before the hearing, no fine may be imposed (AB 130).',
  ],
  noticeLanguage:
    'California law (Civil Code §§ 5850 and 5855, as amended by AB 130) applies to this notice. Before the board imposes a fine or other discipline, you will receive written notice at least 10 days before the board meeting at which it will be considered, and you may be heard. If you cure the violation before that hearing, no fine may be imposed. A fine may not exceed $100 per violation unless the board makes a written finding that the violation may adversely affect health or safety. The association may not charge late fees or interest on a fine. Board: verify against the statute before sending.',
  quotes: [],
  verifyNote: CA_VERIFY,
}

function genericRules(state: string | null): StateRuleSet {
  const where = state ? `your state (${state})` : 'your state'
  return {
    jurisdiction: 'OTHER',
    state,
    title: state ? `${state} — state rules not encoded` : 'Association state not set',
    citation: null,
    sourceUrl: null,
    textVerified: false,
    hearingNoticeDays: null,
    hearingRequiredBeforeFine: false,
    cureBarsFine: false,
    fineCapCents: null,
    fineCapOverride: null,
    lateFeesOnFinesForbidden: false,
    summary: [
      `HomeownerHub does not yet encode the violation-enforcement statute for ${where}.`,
      'Before proposing a fine or suspension, check the notice, hearing, cure-period and fine-limit rules in your state’s statute and your governing documents.',
    ],
    noticeLanguage:
      'Any fine, suspension or other enforcement step will follow the notice and hearing procedures required by your association’s governing documents and applicable state law. Board: verify against your state\'s statute before sending.',
    quotes: [],
    verifyNote: `Verify against your state's statute: no rules are encoded for ${where}.`,
  }
}

const STATE_ALIASES: Record<string, string> = {
  FLORIDA: 'FL',
  CALIFORNIA: 'CA',
  GEORGIA: 'GA',
  TEXAS: 'TX',
}

function normalizeState(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const upper = trimmed.toUpperCase()
  if (STATE_ALIASES[upper]) return STATE_ALIASES[upper]
  return /^[A-Z]{2}$/.test(upper) ? upper : trimmed
}

/** The rule set for an association's stored state. Never throws. */
export function selectStateRules(rawState: string | null | undefined): StateRuleSet {
  const state = normalizeState(rawState)
  if (state === 'FL') return { ...FLORIDA, state }
  if (state === 'CA') return { ...CALIFORNIA, state }
  return genericRules(state)
}

// ─── Refusals ────────────────────────────────────────────────────────

export class StatuteRuleRefusalError extends Error {
  constructor(
    public readonly jurisdiction: RuleJurisdiction,
    public readonly reasons: string[],
  ) {
    // The message is logged to ai_runs.error_code: rule text only, no PII.
    super(`statute_rule_refusal (${jurisdiction}): ${reasons.join(' | ')}`)
    this.name = 'StatuteRuleRefusalError'
  }
}

const dollars = (cents: number): string =>
  `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`

const isPenalty = (step: RequestedStep): boolean => step === 'impose_fine' || step === 'impose_suspension'

/**
 * What the rules say about the board's requested step. `refusals` block
 * the draft outright; `warnings` travel with it to the board.
 */
export function evaluateRequestedAction(
  rules: StateRuleSet,
  raw: RequestedAction | undefined,
): { refusals: string[]; warnings: string[] } {
  const action = RequestedActionSchema.parse(raw ?? {})
  const refusals: string[] = []
  const warnings: string[] = []
  const penalty = action.step === 'impose_suspension' ? 'suspension' : 'fine'
  const fine = action.fineAmountCents

  if (rules.jurisdiction === 'FL') {
    if (isPenalty(action.step) && action.hearingHeld !== true) {
      refusals.push(
        `Florida law (Fla. Stat. § 720.305(2)(b)–(c)) forbids imposing a ${penalty} before the owner gets at least 14 days’ written notice of a hearing and a committee of at least three non-board members approves it by majority vote. Draft a hearing notice instead.`,
      )
    }
    if (isPenalty(action.step) && action.violationCured === true) {
      refusals.push(
        `Florida law (Fla. Stat. § 720.305(2)(e)) forbids a ${penalty} once the violation has been cured before the hearing or as the notice specified.`,
      )
    }
    if (action.step === 'hearing_notice' && action.hearingNoticeDays !== undefined) {
      if (action.hearingNoticeDays < 14) {
        refusals.push(
          `Florida law (Fla. Stat. § 720.305(2)(b)) requires at least 14 days’ written notice of the hearing; ${action.hearingNoticeDays} days was requested.`,
        )
      } else if (action.hearingNoticeDays > 90) {
        refusals.push(
          `Florida law (Fla. Stat. § 720.305(2)(b)) requires the hearing to be held within 90 days after the notice is issued; ${action.hearingNoticeDays} days was requested.`,
        )
      }
    }
    if (fine !== undefined && fine > 10_000) {
      warnings.push(
        `${dollars(fine)} is above Florida’s $100-per-violation default (Fla. Stat. § 720.305(2)). It is allowed only if your governing documents provide otherwise — confirm before sending.`,
      )
    }
  } else if (rules.jurisdiction === 'CA') {
    const verify = ' Verify against the statute.'
    if (isPenalty(action.step) && action.hearingHeld !== true) {
      refusals.push(
        `California law (Civ. Code § 5855) requires written notice at least 10 days before the board meeting and a chance to be heard before a ${penalty} is imposed. Draft a hearing notice instead.${verify}`,
      )
    }
    if (isPenalty(action.step) && action.violationCured === true) {
      refusals.push(
        `California law (AB 130) forbids a ${penalty} when the violation was cured before the hearing.${verify}`,
      )
    }
    if (action.step === 'hearing_notice' && action.hearingNoticeDays !== undefined && action.hearingNoticeDays < 10) {
      refusals.push(
        `California law (Civ. Code § 5855) requires the hearing notice at least 10 days before the meeting; ${action.hearingNoticeDays} days was requested.${verify}`,
      )
    }
    if (fine !== undefined && fine > 10_000 && action.healthSafetyFinding !== true) {
      refusals.push(
        `California law (Civ. Code § 5850, AB 130) caps a fine at $100 per violation; ${dollars(fine)} was requested and the board has not made a written health or safety finding at an open meeting.${verify}`,
      )
    }
    if (action.lateFeeOrInterestOnFine === true) {
      refusals.push(`California law (AB 130) forbids late fees or interest on a fine.${verify}`)
    }
    warnings.push(CA_VERIFY)
  } else {
    warnings.push(rules.verifyNote ?? "Verify against your state's statute.")
  }

  return { refusals, warnings }
}

/** Throws StatuteRuleRefusalError on any refusal; returns the warnings. */
export function assertRequestedActionAllowed(
  rules: StateRuleSet,
  action: RequestedAction | undefined,
): string[] {
  const { refusals, warnings } = evaluateRequestedAction(rules, action)
  if (refusals.length > 0) throw new StatuteRuleRefusalError(rules.jurisdiction, refusals)
  return warnings
}

// ─── Quote validation ────────────────────────────────────────────────

export interface VerifiedQuote {
  citation: string
  pinpoint: string
  quote: string
  sourceUrl: string
}

/**
 * Runs each candidate quote for `step` through the W32 validator against
 * the stored statute text. Only quotes that pass are returned; a failing
 * quote is reported by pinpoint and dropped — never reworded.
 */
export function verifyStatuteQuotes(
  rules: StateRuleSet,
  statuteText: string | null,
  step: RequestedStep,
): { verified: VerifiedQuote[]; rejected: string[]; note: string | null } {
  const candidates = rules.quotes.filter((q) => q.steps.includes(step))
  if (candidates.length === 0) return { verified: [], rejected: [], note: null }
  if (!statuteText) {
    return {
      verified: [],
      rejected: [],
      note: `${rules.citation} text is not ingested yet, so no statute is quoted. Verify against the statute before sending.`,
    }
  }
  const verified: VerifiedQuote[] = []
  const rejected: string[] = []
  for (const q of candidates) {
    try {
      validateCitations([{ refId: q.refId, quote: q.quote }], [{ refId: q.refId, text: statuteText }])
      verified.push({ citation: q.citation, pinpoint: q.pinpoint, quote: q.quote, sourceUrl: q.sourceUrl })
    } catch {
      rejected.push(q.pinpoint)
    }
  }
  return {
    verified,
    rejected,
    note:
      rejected.length > 0
        ? `The stored ${rules.citation} text no longer contains ${rejected.join(', ')} as encoded (the statute may have been amended). Those quotes were left out — verify against the statute before sending.`
        : null,
  }
}

// ─── Letter assembly ─────────────────────────────────────────────────

export const StateRulesOutputSchema = z.object({
  jurisdiction: z.enum(['FL', 'CA', 'OTHER']),
  state: z.string().nullable(),
  title: z.string(),
  citation: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  textVerified: z.boolean(),
  step: RequestedStepSchema,
  summary: z.array(z.string()),
  quotes: z.array(
    z.object({ citation: z.string(), pinpoint: z.string(), quote: z.string(), sourceUrl: z.string() }),
  ),
  warnings: z.array(z.string()),
})
export type StateRulesOutput = z.infer<typeof StateRulesOutputSchema>

function stepLanguage(rules: StateRuleSet, step: RequestedStep): string | null {
  if (rules.jurisdiction === 'FL' && step === 'hearing_notice') {
    return 'Hearing: [DATE — at least 14 and no more than 90 days after this notice], [LOCATION], [TELEPHONE / VIDEO ACCESS]. Action required to cure: [SPECIFIC ACTION].'
  }
  if (rules.jurisdiction === 'FL' && step === 'impose_fine') {
    return 'The committee approved this fine at the hearing. Payment is due on [DATE — at least 30 days after delivery of this notice].'
  }
  if (rules.jurisdiction === 'CA' && step === 'hearing_notice') {
    return 'Hearing: [BOARD MEETING DATE — at least 10 days after this notice], [LOCATION]. You may attend and be heard.'
  }
  return null
}

function noticeBlock(rules: StateRuleSet, step: RequestedStep, quotes: VerifiedQuote[]): string {
  const lines = ['', '—', 'Statutory notice', rules.noticeLanguage]
  const extra = stepLanguage(rules, step)
  if (extra) lines.push(extra)
  for (const q of quotes) lines.push(`${q.citation}${q.pinpoint}: “${q.quote}”`)
  return lines.join('\n')
}

/**
 * Post-model assembly. Refuses a forbidden step (throws), appends the
 * state notice block and validated quotes to the model's draft, and caps
 * the recommended fine where the state forbids more.
 */
export function applyStateRulesToDraft(args: {
  rules: StateRuleSet
  requestedAction: RequestedAction | undefined
  modelNotice: string
  statuteText: string | null
  recommendedFineAmountCents: number
}): { notice: string; recommendedFineAmountCents: number; stateRules: StateRulesOutput } {
  const { rules } = args
  const action = RequestedActionSchema.parse(args.requestedAction ?? {})
  const warnings = assertRequestedActionAllowed(rules, action)
  const quotes = verifyStatuteQuotes(rules, args.statuteText, action.step)
  if (quotes.note) warnings.push(quotes.note)

  let recommended = args.recommendedFineAmountCents
  if (
    rules.fineCapOverride === 'health_safety_finding' &&
    rules.fineCapCents !== null &&
    action.healthSafetyFinding !== true &&
    recommended > rules.fineCapCents
  ) {
    recommended = rules.fineCapCents
  }

  return {
    notice: `${args.modelNotice.trimEnd()}\n${noticeBlock(rules, action.step, quotes.verified)}`,
    recommendedFineAmountCents: recommended,
    stateRules: {
      jurisdiction: rules.jurisdiction,
      state: rules.state,
      title: rules.title,
      citation: rules.citation,
      sourceUrl: rules.sourceUrl,
      textVerified: rules.textVerified,
      step: action.step,
      summary: rules.summary,
      quotes: quotes.verified,
      warnings,
    },
  }
}

/** Short prompt context so the model's prose does not contradict the rules. */
export function stateRulesPromptContext(rules: StateRuleSet, step: RequestedStep): string {
  return [
    `Governing state law: ${rules.title}.`,
    `Requested letter: ${step.replace(/_/g, ' ')}.`,
    ...rules.summary.map((s) => `- ${s}`),
    'A statutory notice paragraph with any statute quotes is appended to your draft automatically. Do NOT quote or cite statutes yourself, and do not state that a fine or suspension has been or will be imposed unless the requested letter is a fine or suspension letter.',
  ].join('\n')
}
