// BL-147: what each state's statute says about a late charge, quoted word
// for word from the statute fixtures in scripts/fixtures/state-law/
// (law.test.ts checks every quote is still in its fixture).
//
// Only rules we have the text for are encoded. A state with no loaded rule
// (Texas today, and every other state) gets null: the screen says "check
// your governing documents" and no cap applies beyond what the board sets.
//
// Dependency-free (no imports): packages/jobs imports this file by relative
// path, like compliance/deadlines.ts, so the nightly job enforces the same
// caps the settings screen does.

export interface LateFeeLaw {
  /** USPS code. */
  state: string
  stateName: string
  /** Short citation shown next to the quote. */
  citation: string
  /** The fixture file every quote is checked against. */
  fixture: string
  /** Verbatim statute text, in order. */
  quotes: readonly string[]
  /** The statute only allows a late charge when the declaration (or bylaws) provides for one. */
  requiresInstrument: boolean
  /** "the greater of $X or Y%": X in cents. */
  floorCents: number
  /** "the greater of $X or Y%": Y as a whole percent. */
  percent: number
  /** Days after the due date before a charge is delinquent, when the statute sets one. */
  minGraceDays: number
}

export const LATE_FEE_LAWS: Readonly<Record<'GA' | 'FL' | 'CA', LateFeeLaw>> = {
  GA: {
    state: 'GA',
    stateName: 'Georgia',
    citation: 'O.C.G.A. § 44-3-232(b)(1)',
    fixture: 'ga-ocga-44-3-art6-2026.txt',
    quotes: [
      '(b) To the extent that the instrument provides, the personal obligation of the lot owner and the lien for assessments shall also include:',
      '(1) A late or delinquency charge not in excess of the greater of $10.00 or 10 percent of the amount of each assessment or installment thereof not paid when due;',
    ],
    requiresInstrument: true,
    floorCents: 1000,
    percent: 10,
    minGraceDays: 0,
  },
  FL: {
    state: 'FL',
    stateName: 'Florida',
    citation: 'Fla. Stat. § 720.3085(3)(a)',
    fixture: 'flsenate-ch720-2026.html',
    quotes: [
      'If the declaration or bylaws so provide, the association may also charge an administrative late fee not to exceed the greater of $25 or 5 percent of the amount of each installment that is paid past the due date.',
    ],
    requiresInstrument: true,
    floorCents: 2500,
    percent: 5,
    minGraceDays: 0,
  },
  CA: {
    state: 'CA',
    stateName: 'California',
    citation: 'Cal. Civ. Code § 5650(b)',
    fixture: 'ca-civ-davis-stirling-2026.txt',
    quotes: [
      'Regular and special assessments levied pursuant to the governing documents are delinquent 15 days after they become due, unless the declaration provides a longer time period, in which case the longer time period shall apply.',
      'A late charge not exceeding 10 percent of the delinquent assessment or ten dollars ($10), whichever is greater, unless the declaration specifies a late charge in a smaller amount, in which case any late charge imposed shall not exceed the amount specified in the declaration.',
    ],
    requiresInstrument: false,
    floorCents: 1000,
    percent: 10,
    minGraceDays: 15,
  },
}

/** Shown where no rule is loaded. */
export const NO_LOADED_RULE_NOTE =
  'HomeownerHub has no late-charge rule loaded for your state. Check your governing documents (and your association’s attorney) for what you may charge. No cap applies beyond what the board sets here.'

/** The association's state for the law: governing_law_state, else state. */
export function lateFeeStateOf(a: { state?: string | null; governing_law_state?: string | null } | null | undefined): string | null {
  return (a?.governing_law_state ?? a?.state ?? '').trim().toUpperCase() || null
}

export function lateFeeLaw(state: string | null | undefined): LateFeeLaw | null {
  const s = (state ?? '').trim().toUpperCase()
  return s === 'GA' || s === 'FL' || s === 'CA' ? LATE_FEE_LAWS[s] : null
}

/**
 * The statutory ceiling for a late charge on `lateCents` still unpaid:
 * the greater of the floor or the percent. The percent is taken of the
 * amount still unpaid (never more than the charge), rounded DOWN to the
 * cent, so the ceiling is never above what the statute allows.
 */
export function statutoryCapCents(law: LateFeeLaw, lateCents: number): number {
  const pct = Math.floor((Math.max(0, lateCents) * law.percent) / 100)
  return Math.max(law.floorCents, pct)
}

/** "the greater of $10.00 or 10%" */
export function capSummary(law: LateFeeLaw): string {
  return `the greater of $${(law.floorCents / 100).toFixed(2)} or ${law.percent}% of the late amount`
}
