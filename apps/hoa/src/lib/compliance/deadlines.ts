/**
 * BL-131 (no-migration stopgap) — statutory compliance deadlines.
 *
 * A short, vetted list of fixed state-law obligations, shown to the board
 * as a dashboard card and a daily-digest line until the board marks each
 * one done. Board-facing only: nothing here is ever sent to a resident.
 *
 * WHAT IS IN THE LIST. Only obligations whose text we hold as a fixture
 * under scripts/fixtures/state-law and cite exactly:
 *  - GA: owners' association registration with the Secretary of State,
 *    O.C.G.A. § 43-17A-2 (Ga. L. 2026, SB 406 § 2), in force 2027-01-01
 *    (SB 406 § 9(a)). Fixture: ga-sb406-2026-registration.txt.
 *  - GA (BL-152): the nonprofit corporation's annual registration with the
 *    Secretary of State, due between Jan 1 and Apr 1 every year, O.C.G.A.
 *    § 14-3-1622(c); administrative dissolution may start once it is 60
 *    days late, § 14-3-1420(2). Fixture: ga-ocga-14-3-2026.txt. One code per
 *    filing year (ga-corp-annual-registration-YYYY), so marking 2027 done
 *    never hides 2028. The year shown is today's, from 2027 (the first
 *    season after this shipped).
 *  - US (BL-167): the federal 1099-NEC and Form 1120-H dates, for every
 *    association in every state. Cited from irs.gov, not a state fixture.
 *    One code per tax year (federal-1099-nec-YYYY, federal-1120-h-YYYY).
 *  - TX: the management certificate, Tex. Prop. Code § 209.004. A standing
 *    obligation with no calendar date (record it, e-file with TREC within 7
 *    days, amend within 30 days of a change). Fixture:
 *    tx-prop-209-004-2026.txt.
 * Left out on purpose (see the BL-131 notes in docs/backlog.md): FL
 * milestone inspections and SIRS (§ 553.899 and ch. 718: condominium and
 * cooperative buildings, not ch. 720 HOAs), CA balcony inspections (Civ.
 * Code § 5551: the section text is not in our fixtures).
 *
 * STORAGE. No migration: associations.compliance_settings[COMPLIANCE_ACK_KEY]
 * holds one signed acknowledgment per deadline code, next to the ARC clock
 * and the other signed settings. Every write keeps the other keys.
 *
 * WHY SIGNED. Same reason as lib/arc-review/clock.ts: until 0063 is applied
 * any org member can PATCH compliance_settings with their own session. Only
 * an acknowledgment whose HMAC verifies with the server-only secret counts;
 * anything else reads as "not done", so a forged value can't hide a
 * warning.
 *
 * BL-131 FULL (migration 0067, behind M3_APPLIED): "done" lives in the
 * compliance_deadlines_done table, one row per (association, code), board
 * RLS. Callers pass the rows in (`done`) when the flag is on; a verified
 * signed acknowledgment still counts too, so nothing a board already marked
 * reappears, and `acksToMigrate` lists the acknowledgments that have no row
 * yet so the dashboard can copy them across lazily. With the flag off the
 * table is never read and only the signed acknowledgments count.
 *
 * Pure and dependency-free (node:crypto only) on purpose: packages/jobs
 * (the daily digest) imports this file by relative path, so it must not use
 * the `@/` alias.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export const COMPLIANCE_ACK_KEY = 'compliance_deadline_acks'
const SIGNATURE_DOMAIN = 'compliance-deadline-ack:v1'

/** Amber at or below this many days left; red once the date has passed. */
export const COMPLIANCE_DUE_SOON_DAYS = 30
/** A dated deadline puts a line in the daily digest from this many days out. */
export const COMPLIANCE_DIGEST_WINDOW_DAYS = 90

export type { ComplianceState } from './state'
import type { ComplianceState } from './state'
export { complianceState } from './state'
import { complianceState } from './state'

export interface ComplianceDeadline {
  /** Stable id; the acknowledgment is stored under it. */
  code: string
  /** 'US': a federal deadline that applies to every association, whatever its state (BL-167). */
  state: ComplianceState | 'US'
  title: string
  /** The exact citation, as the card and the digest print it. */
  citation: string
  /** YYYY-MM-DD the requirement takes effect or is due, or null for a standing obligation. */
  dueOn: string | null
  /** What happens if it is missed, in plain words, with the subsection. */
  consequence: string
  /** Steps, in order. Each cites the subsection it comes from. */
  whatToDo: string[]
  officialUrl: string
  officialLabel: string
  /** The statute text we hold, under scripts/fixtures/state-law. null for 'US' rows: they cite irs.gov instead. */
  fixture: string | null
  /** Who it applies to, in the board's words. */
  appliesTo: string
  /**
   * 'effective' (default): dueOn is the day a rule takes effect.
   * 'filing': dueOn is the last day of a filing window that opens on
   * `opensOn`; late from the next day.
   */
  dueKind?: 'effective' | 'filing'
  opensOn?: string
  /** 'filing' only: days after dueOn when the stated consequence can start. */
  graceDays?: number
  /** BL-167: where the app already prepares the inputs for this deadline (the year-end package). */
  prepHref?: string
  prepLabel?: string
}

/** A fixed state-law entry: always has a state and a statute fixture. */
export type StateComplianceDeadline = ComplianceDeadline & { state: ComplianceState; fixture: string }

export const COMPLIANCE_DEADLINES: readonly StateComplianceDeadline[] = [
  {
    code: 'ga-sos-registration-2027',
    state: 'GA',
    title: 'Register with the Georgia Secretary of State',
    citation: 'O.C.G.A. § 43-17A-2 (Ga. L. 2026, SB 406 (Act 715) § 2; effective Jan 1, 2027, § 9(a))',
    dueOn: '2027-01-01',
    consequence:
      'From Jan 1, 2027, an owners’ association that is not registered may not collect fines or fees, file or record liens, or start foreclosure (§ 43-17A-2(a)(2)(A)).',
    whatToDo: [
      'Decide as a board: register, or file a written notice with the Secretary of State electing not to register. An association that opts out may not assess or collect fines, fees or accelerated assessments (§ 43-17A-2(a)(2)(B)).',
      'Gather what the registration statement needs: your governing documents; the association’s name, address and officers; and a financial statement dated no more than one year before filing (§ 43-17A-2(a)(3)).',
      'File the registration statement with the Secretary of State and pay the $100 fee (§ 43-17A-2(e)). The Secretary of State says filing opens on or after Jan 1, 2027 through an online portal; check its page for the date.',
      'Put the renewal on the calendar: each registration expires December 31 and must be renewed every year by then, and changes to name, address or officers need an amended statement within 30 days (§ 43-17A-2(c), (d)).',
      'Confirm the details with your association’s attorney.',
    ],
    officialUrl: 'https://sos.ga.gov/georgia-property-owners-associations-division',
    officialLabel: 'Georgia Secretary of State — Property Owners’ Associations Division',
    fixture: 'scripts/fixtures/state-law/ga-sb406-2026-registration.txt',
    appliesTo: 'Georgia owners’ associations, including HOAs and condominium associations (§ 43-17A-1(6)).',
  },
  {
    code: 'tx-management-certificate',
    state: 'TX',
    title: 'Keep your management certificate recorded and filed with TREC',
    citation: 'Tex. Prop. Code § 209.004',
    dueOn: null,
    consequence:
      'While the certificate isn’t recorded with the county or filed with TREC, an owner isn’t liable for attorney’s fees or interest on a delinquent assessment, and a buyer or lender isn’t liable for amounts owed before a sale (§ 209.004(d), (e)).',
    whatToDo: [
      'Record a management certificate in every county where the subdivision lies, signed by an officer or the managing agent, with the items in § 209.004(a).',
      'File the same certificate electronically with the Texas Real Estate Commission no later than 7 days after recording it (§ 209.004(b-1)).',
      'When anything on it changes (manager, address, website, transfer fees), record an amended certificate within 30 days and file it with TREC within 7 days after that (§ 209.004(b), (b-1)).',
    ],
    officialUrl: 'https://hoa.texas.gov',
    officialLabel: 'TREC HOA management certificate filing (hoa.texas.gov)',
    fixture: 'scripts/fixtures/state-law/tx-prop-209-004-2026.txt',
    appliesTo: 'Texas property owners’ associations under Property Code ch. 209 (not condominiums).',
  },
]

// ─── Georgia: the nonprofit corporation's annual registration (BL-152) ──

const GA_CORP_CODE_RE = /^ga-corp-annual-registration-(\d{4})$/
/** The first filing season HomeownerHub tracks (BL-152 shipped in late 2026). */
export const GA_CORP_FIRST_YEAR = 2027
/** § 14-3-1420(2): administrative dissolution may start this many days after the due date. */
export const GA_CORP_GRACE_DAYS = 60

export function gaCorpRegistrationCode(year: number): string {
  return `ga-corp-annual-registration-${year}`
}

/** The filing year that matters today: this calendar year, never before 2027. */
export function gaCorpRegistrationYear(todayYmd: string): number {
  return Math.max(Number(todayYmd.slice(0, 4)), GA_CORP_FIRST_YEAR)
}

export function gaCorpRegistrationDeadline(year: number): ComplianceDeadline {
  return {
    code: gaCorpRegistrationCode(year),
    state: 'GA',
    title: `File the corporation’s ${year} annual registration with the Secretary of State`,
    citation: 'O.C.G.A. § 14-3-1622(c); § 14-3-1420(2)',
    dueOn: `${year}-04-01`,
    dueKind: 'filing',
    opensOn: `${year}-01-01`,
    graceDays: GA_CORP_GRACE_DAYS,
    consequence:
      'If the annual registration is not delivered, with the fees and penalties, within 60 days after it is due, the Secretary of State may start administratively dissolving the corporation (§ 14-3-1420(2)).',
    whatToDo: [
      'File the annual registration with the Secretary of State between January 1 and April 1 (§ 14-3-1622(c)), online through the Secretary of State’s Corporations Division.',
      'List the registered agent and office, the principal office’s mailing address, and the chief executive officer, chief financial officer and secretary (§ 14-3-1622(a)). Make them current on the day you file (§ 14-3-1622(b)).',
      'A corporation incorporated last year files its first one this season; one incorporated this year follows § 14-3-1622(d). Check the fee and any penalty on the Secretary of State’s page.',
      'Keep the filed registration: members may ask to see the most recent one (§ 14-3-1602(a)(8)).',
      'This is separate from the owners’ association registration under SB 406, which renews by December 31.',
    ],
    officialUrl: 'https://sos.ga.gov/how-to-guide/how-file-annual-registration',
    officialLabel: 'Georgia Secretary of State — How to file an annual registration',
    fixture: 'scripts/fixtures/state-law/ga-ocga-14-3-2026.txt',
    appliesTo:
      'Georgia associations incorporated as nonprofit corporations (most are; your articles of incorporation say so). An unincorporated association doesn’t file this.',
  }
}

// ─── Federal: Form 1099-NEC and Form 1120-H (BL-167) ────────────────
//
// Sources, read on irs.gov on 2026-10-26 (re-verify each filing season):
//  - Instructions for Forms 1099-MISC and 1099-NEC,
//    https://www.irs.gov/instructions/i1099mec : "file Form 1099-NEC on or
//    before January 31"; "If any date shown falls on a Saturday, Sunday, or
//    legal holiday in the District of Columbia or where the return is to be
//    filed, the due date is the next business day." For tax years beginning
//    after 2025 the reporting threshold "increased to $2,000 and may be
//    adjusted for inflation beginning in calendar year 2027". So the
//    threshold is stated for 2026 only; later years say "check irs.gov".
//  - Instructions for Form 1120-H, https://www.irs.gov/instructions/i1120h
//    (2025 revision): "Generally, an association must file Form 1120-H by
//    the 15th day of the 4th month after the end of its tax year"; if the
//    due date falls on a Saturday, Sunday or legal holiday, the next
//    business day; Form 7004 requests an automatic extension. Electing
//    section 528 treatment is done by filing the form, so the row is
//    worded "if it files".
// Dates here assume a calendar tax year (Dec 31). A different fiscal year
// moves the 1120-H date; the row says so and points at the instructions.
// HomeownerHub gives dates and a pointer to the year-end package. It does
// not say who must file or what is owed: not legal or tax advice.

const FEDERAL_CODE_RE = /^federal-(1099-nec|1120-h)-(\d{4})$/
/** The first tax year tracked: payments and income in 2026 (shipped Oct 2026). */
export const FEDERAL_FIRST_YEAR = 2026
/** A missed federal date stays on the card and in the digest this long, then the next tax year takes over. */
export const FEDERAL_LATE_VISIBLE_DAYS = 90
export const NEC_INSTRUCTIONS_URL = 'https://www.irs.gov/instructions/i1099mec'
export const FORM_1120H_URL = 'https://www.irs.gov/instructions/i1120h'
export const YEAR_END_PACKAGE_HREF = '/accounting/reports/year-end'
const NOT_TAX_ADVICE_NOTE = 'Not legal or tax advice: your CPA decides what applies to the association.'

export function federal1099Code(taxYear: number): string {
  return `federal-1099-nec-${taxYear}`
}
export function federal1120hCode(taxYear: number): string {
  return `federal-1120-h-${taxYear}`
}

/** D.C. Emancipation Day (Apr 16) is a legal holiday in D.C.; observed Friday if it is a Saturday, Monday if a Sunday. */
function isLegalHolidayForFiling(ymd: string): boolean {
  const [y, m, d] = ymd.split('-').map(Number)
  if (m !== 4) return false
  const dow = new Date(Date.UTC(y!, 3, 16)).getUTCDay()
  const observed = dow === 6 ? 15 : dow === 0 ? 17 : 16
  return d === observed
}

/** The next business day on or after `ymd` (weekends; the April D.C. holiday). */
function nextBusinessDay(ymd: string): string {
  let day = ymd
  for (;;) {
    const dow = new Date(dayIndex(day) * DAY_MS).getUTCDay()
    if (dow !== 0 && dow !== 6 && !isLegalHolidayForFiling(day)) return day
    day = addCalendarDays(day, 1)
  }
}

/** Form 1099-NEC for payments made in `taxYear`: Jan 31 after, or the next business day (2026 payments: Feb 1, 2027). */
export function nec1099DueOn(taxYear: number): string {
  return nextBusinessDay(`${taxYear + 1}-01-31`)
}

/** Form 1120-H for a calendar `taxYear`: the 15th day of the 4th month after year end, or the next business day. */
export function form1120hDueOn(taxYear: number): string {
  return nextBusinessDay(`${taxYear + 1}-04-15`)
}

/**
 * The tax year that matters today: last year's until its date is 90 days
 * past (a missed one stays visible), else this year's; never before 2026.
 */
export function federalTaxYear(todayYmd: string, dueOn: (taxYear: number) => string): number {
  const y = Number(todayYmd.slice(0, 4))
  const prev = y - 1
  const stillVisible = todayYmd <= addCalendarDays(dueOn(prev), FEDERAL_LATE_VISIBLE_DAYS)
  return Math.max(stillVisible ? prev : y, FEDERAL_FIRST_YEAR)
}

export function federal1099Deadline(taxYear: number): ComplianceDeadline {
  const threshold =
    taxYear === 2026
      ? 'For payments made in 2026 the IRS reporting threshold is $2,000.'
      : 'The reporting threshold can change with inflation from 2027: check irs.gov.'
  return {
    code: federal1099Code(taxYear),
    state: 'US',
    title: `Send ${taxYear} Forms 1099-NEC to vendors and file them with the IRS`,
    citation: 'IRS, Instructions for Forms 1099-MISC and 1099-NEC (irs.gov/instructions/i1099mec)',
    dueOn: nec1099DueOn(taxYear),
    dueKind: 'filing',
    consequence: `The IRS can charge a penalty for each form filed or sent late. ${NOT_TAX_ADVICE_NOTE}`,
    whatToDo: [
      `Download the year-end package for ${taxYear}: its 1099-NEC candidate list shows who was paid $600 or more, and flags who was paid over $2,000.`,
      `${threshold} Confirm which vendors need a form with your CPA; HomeownerHub doesn’t know if a vendor is a corporation.`,
      'File with the IRS and send each vendor their copy by the date shown. January 31 moves to the next business day when it falls on a weekend or holiday.',
      'Mark it done here and attach proof of filing (the IRS or e-file receipt) as evidence.',
    ],
    officialUrl: NEC_INSTRUCTIONS_URL,
    officialLabel: 'IRS — Instructions for Forms 1099-MISC and 1099-NEC',
    fixture: null,
    appliesTo:
      'Any association that paid a vendor for services at or above the IRS threshold during the year. If it paid none, there is nothing to file: mark it done.',
    prepHref: YEAR_END_PACKAGE_HREF,
    prepLabel: 'Open the year-end package',
  }
}

export function federal1120hDeadline(taxYear: number): ComplianceDeadline {
  return {
    code: federal1120hCode(taxYear),
    state: 'US',
    title: `File the association’s ${taxYear} Form 1120-H, if it files one`,
    citation: 'IRS, Instructions for Form 1120-H (irs.gov/instructions/i1120h)',
    dueOn: form1120hDueOn(taxYear),
    dueKind: 'filing',
    consequence: `A late return can bring IRS penalties, and Form 7004 asks for an automatic extension. ${NOT_TAX_ADVICE_NOTE}`,
    whatToDo: [
      `Download the year-end package for ${taxYear}: it includes a Form 1120-H worksheet for your CPA.`,
      'Ask your CPA whether the association files Form 1120-H or another return. Filing the form is how an association elects section 528 treatment.',
      'The date shown is for a calendar tax year: the 15th day of the 4th month after year end, or the next business day. A different fiscal year moves it; the IRS instructions explain.',
      'Mark it done here and attach the filed return or the extension request (Form 7004) as evidence.',
    ],
    officialUrl: FORM_1120H_URL,
    officialLabel: 'IRS — Instructions for Form 1120-H',
    fixture: null,
    appliesTo:
      'Homeowners associations that file Form 1120-H. If your CPA files a different return, or none, mark it done.',
    prepHref: YEAR_END_PACKAGE_HREF,
    prepLabel: 'Open the year-end package',
  }
}

/** Both federal deadlines for today's tax years. Every association gets them, in every state. */
export function federalDeadlines(todayYmd: string): ComplianceDeadline[] {
  return [
    federal1099Deadline(federalTaxYear(todayYmd, nec1099DueOn)),
    federal1120hDeadline(federalTaxYear(todayYmd, form1120hDueOn)),
  ]
}

/** A deadline by its code: the fixed list, or a Georgia corporate registration year (2027–2099). */
export function deadlineByCode(code: unknown): ComplianceDeadline | null {
  if (typeof code !== 'string') return null
  const fixed = COMPLIANCE_DEADLINES.find((d) => d.code === code)
  if (fixed) return fixed
  const f = FEDERAL_CODE_RE.exec(code)
  if (f) {
    const taxYear = Number(f[2])
    if (taxYear < FEDERAL_FIRST_YEAR || taxYear > 2099) return null
    return f[1] === '1099-nec' ? federal1099Deadline(taxYear) : federal1120hDeadline(taxYear)
  }
  const m = GA_CORP_CODE_RE.exec(code)
  if (!m) return null
  const year = Number(m[1])
  return year >= GA_CORP_FIRST_YEAR && year <= 2099 ? gaCorpRegistrationDeadline(year) : null
}

// ─── State ──────────────────────────────────────────────────────────


/**
 * The deadlines that apply in this state. With `todayYmd`, Georgia also
 * gets the corporation's annual registration for today's filing year.
 * BL-167: with `todayYmd`, every association also gets the federal rows,
 * even one with no known state.
 */
export function deadlinesForState(state: ComplianceState | null, todayYmd?: string): ComplianceDeadline[] {
  const federal = todayYmd ? federalDeadlines(todayYmd) : []
  if (!state) return federal
  const fixed = COMPLIANCE_DEADLINES.filter((d) => d.state === state)
  if (state === 'GA' && todayYmd) return [...fixed, gaCorpRegistrationDeadline(gaCorpRegistrationYear(todayYmd)), ...federal]
  return [...fixed, ...federal]
}

/** The code is a deadline for this state (any year, for the Georgia corporate registration). */
export function deadlineAppliesToState(state: ComplianceState | null, code: unknown): boolean {
  const d = deadlineByCode(code)
  return d !== null && (d.state === 'US' || (state !== null && d.state === state))
}

// ─── Acknowledgments: sign / read / merge ───────────────────────────

/** One stored acknowledgment, under compliance_settings.compliance_deadline_acks[code]. */
export interface StoredComplianceAck {
  done_at: string
  done_by: string | null
  sig: string
}

export interface ComplianceAck {
  doneAt: string
  doneBy: string | null
}

/**
 * The server-only signing secret. The same chain as arcClockSecret() and
 * paySettingsSecret(); repeated because packages/jobs imports this file.
 */
export function complianceAckSecret(env: Record<string, string | undefined> = process.env): string | null {
  return env.PAY_SETTINGS_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || null
}

export function isKnownDeadlineCode(code: unknown): code is string {
  return deadlineByCode(code) !== null
}

function payload(associationId: string, code: string, doneAt: string, doneBy: string | null): string {
  return JSON.stringify([SIGNATURE_DOMAIN, associationId, code, doneAt, doneBy])
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

export function signComplianceAck(
  associationId: string,
  code: string,
  ack: ComplianceAck,
  secret: string,
): StoredComplianceAck {
  if (!isKnownDeadlineCode(code)) throw new RangeError('unknown deadline code')
  return { done_at: ack.doneAt, done_by: ack.doneBy, sig: hmac(secret, payload(associationId, code, ack.doneAt, ack.doneBy)) }
}

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/**
 * The verified acknowledgments for one association, by code. A value that
 * is malformed, for an unknown code, or whose signature doesn't verify is
 * left out: that deadline still shows.
 */
export function readComplianceAcks(
  associationId: string,
  complianceSettings: unknown,
  secret: string | null,
): Map<string, ComplianceAck> {
  const out = new Map<string, ComplianceAck>()
  const all = asObject(asObject(complianceSettings)?.[COMPLIANCE_ACK_KEY])
  if (!all || !secret) return out
  for (const [code, raw] of Object.entries(all)) {
    const v = asObject(raw)
    if (!v || !isKnownDeadlineCode(code)) continue
    if (typeof v.done_at !== 'string' || !(v.done_by === null || typeof v.done_by === 'string') || typeof v.sig !== 'string') {
      continue
    }
    const expected = Buffer.from(hmac(secret, payload(associationId, code, v.done_at, v.done_by)), 'hex')
    const actual = Buffer.from(v.sig, 'hex')
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) continue
    out.set(code, { doneAt: v.done_at, doneBy: v.done_by })
  }
  return out
}

/** compliance_settings with this one acknowledgment added; every other key and acknowledgment kept. */
export function withComplianceAck(
  complianceSettings: unknown,
  code: string,
  stored: StoredComplianceAck,
): Record<string, unknown> {
  const settings = asObject(complianceSettings) ?? {}
  const acks = asObject(settings[COMPLIANCE_ACK_KEY]) ?? {}
  return { ...settings, [COMPLIANCE_ACK_KEY]: { ...acks, [code]: stored } }
}

// ─── compliance_deadlines_done rows (migration 0067, M3_APPLIED) ─────

export const COMPLIANCE_DONE_TABLE = 'compliance_deadlines_done'

/** One compliance_deadlines_done row, as the app reads and writes it. */
export interface ComplianceDoneRow {
  organization_id: string
  association_id: string
  code: string
  done_at: string
  done_by: string | null
}

/** association id → code → when and by whom. */
export type ComplianceDoneByAssociation = Map<string, Map<string, ComplianceAck>>

/** Rows from the table, keyed for lookup. Malformed rows and unknown codes are left out. */
export function doneRowsByAssociation(rows: readonly unknown[]): ComplianceDoneByAssociation {
  const out: ComplianceDoneByAssociation = new Map()
  for (const raw of rows) {
    const r = asObject(raw)
    if (!r || typeof r.association_id !== 'string' || !isKnownDeadlineCode(r.code) || typeof r.done_at !== 'string') continue
    const byCode = out.get(r.association_id) ?? new Map<string, ComplianceAck>()
    byCode.set(r.code, { doneAt: r.done_at, doneBy: typeof r.done_by === 'string' ? r.done_by : null })
    out.set(r.association_id, byCode)
  }
  return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDb = { from: (table: string) => any }

/**
 * Every done row for the org's associations, or null when the read failed
 * (the caller then falls back to the signed acknowledgments alone, and
 * says nothing is wrong — a deadline shown that was done beats a deadline
 * hidden that was not). Ids and codes only in the log.
 */
export async function loadComplianceDone(db: LooseDb, orgId: string): Promise<ComplianceDoneByAssociation | null> {
  const { data, error } = (await db
    .from(COMPLIANCE_DONE_TABLE)
    .select('association_id, code, done_at, done_by')
    .eq('organization_id', orgId)) as { data: unknown[] | null; error: { code?: string } | null }
  if (error) {
    console.error('[compliance-deadlines] done rows read failed', { orgId, code: error.code ?? null })
    return null
  }
  return doneRowsByAssociation(data ?? [])
}

/**
 * The verified signed acknowledgments that have no row yet: what the lazy
 * migration copies into compliance_deadlines_done. Only codes that apply to
 * the association's state, so a stray acknowledgment never becomes a row.
 */
export function acksToMigrate(
  orgId: string,
  associations: readonly ComplianceAssociationInput[],
  secret: string | null,
  done: ComplianceDoneByAssociation,
): ComplianceDoneRow[] {
  const out: ComplianceDoneRow[] = []
  for (const a of associations) {
    const state = complianceState(a.governingLawState, a.state)
    for (const [code, ack] of readComplianceAcks(a.id, a.complianceSettings, secret)) {
      if (!deadlineAppliesToState(state, code) || done.get(a.id)?.has(code)) continue
      out.push({ organization_id: orgId, association_id: a.id, code, done_at: ack.doneAt, done_by: ack.doneBy })
    }
  }
  return out
}

// ─── Day math ───────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000

function dayIndex(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return Math.round(Date.UTC(y!, m! - 1, d!) / DAY_MS)
}

/** Calendar days from `todayYmd` to `dueYmd`: 0 on the day, negative after. */
export function daysUntil(todayYmd: string, dueYmd: string): number {
  return dayIndex(dueYmd) - dayIndex(todayYmd)
}

export type ComplianceTone = 'upcoming' | 'soon' | 'overdue' | 'standing'

export function complianceTone(daysLeft: number | null): ComplianceTone {
  if (daysLeft === null) return 'standing'
  if (daysLeft <= 0) return 'overdue'
  if (daysLeft <= COMPLIANCE_DUE_SOON_DAYS) return 'soon'
  return 'upcoming'
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Jan 1, 2027". */
export function formatDueOn(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return `${MONTHS[m! - 1]} ${d}, ${y}`
}

function days(n: number): string {
  return `${n} day${n === 1 ? '' : 's'}`
}

/** "Takes effect in 73 days (Jan 1, 2027)", "Takes effect today", "In effect since Jan 1, 2027", "Ongoing". */
export function complianceLabel(dueOn: string | null, daysLeft: number | null): string {
  if (dueOn === null || daysLeft === null) return 'Ongoing — confirm it’s filed'
  if (daysLeft > 0) return `Takes effect in ${days(daysLeft)} (${formatDueOn(dueOn)})`
  if (daysLeft === 0) return `Takes effect today (${formatDueOn(dueOn)})`
  return `In effect since ${formatDueOn(dueOn)}`
}

/** 'filing' deadlines: late from the day after dueOn, not on it. */
export function deadlineTone(d: Pick<ComplianceDeadline, 'dueKind'>, daysLeft: number | null): ComplianceTone {
  if (d.dueKind === 'filing' && daysLeft === 0) return 'soon'
  return complianceTone(daysLeft)
}

/**
 * The label for any deadline. 'filing': "Filing opens Jan 1, 2027 · due
 * Apr 1, 2027", "Due Apr 1, 2027 (in 12 days)", "Due today (…)", then late,
 * and past graceDays the consequence's start. Otherwise complianceLabel.
 */
export function deadlineLabel(d: ComplianceDeadline, todayYmd: string): string {
  if (!d.dueOn) return complianceLabel(null, null)
  const left = daysUntil(todayYmd, d.dueOn)
  if (d.dueKind !== 'filing') return complianceLabel(d.dueOn, left)
  const due = formatDueOn(d.dueOn)
  if (d.opensOn && todayYmd < d.opensOn) return `Filing opens ${formatDueOn(d.opensOn)} · due ${due}`
  if (left > 0) return `Due ${due} (in ${days(left)})`
  if (left === 0) return `Due today (${due})`
  if (d.graceDays === undefined) return `Late since ${due}`
  const graceEnd = formatDueOn(addCalendarDays(d.dueOn, d.graceDays))
  return -left <= d.graceDays
    ? `Late since ${due} · if it isn’t filed by ${graceEnd}, the Secretary of State may start administrative dissolution`
    : `Late since ${due} · more than ${days(d.graceDays)}: the Secretary of State may start administrative dissolution. File now`
}

function addCalendarDays(ymd: string, n: number): string {
  return new Date((dayIndex(ymd) + n) * DAY_MS).toISOString().slice(0, 10)
}

// ─── What the board sees ────────────────────────────────────────────

export interface ComplianceAssociationInput {
  id: string
  name: string
  state: string | null
  governingLawState: string | null
  complianceSettings: unknown
  /** BL-155: associations.type ('hoa' | 'condo' | 'coop'). Absent or not 'condo': the POA Act rows. */
  type?: string | null
}

export interface PendingComplianceItem {
  associationId: string
  associationName: string
  deadline: ComplianceDeadline
  /** null for a standing obligation. */
  daysLeft: number | null
  tone: ComplianceTone
  label: string
}

/**
 * Every deadline that applies to these associations by state and has not
 * been marked done — by a verified acknowledgment, or (M3_APPLIED, the
 * caller passes `done`) by a compliance_deadlines_done row. Dated ones
 * first, soonest first; then standing ones.
 */
export function pendingComplianceItems(
  associations: readonly ComplianceAssociationInput[],
  todayYmd: string,
  secret: string | null,
  done: ComplianceDoneByAssociation | null = null,
): PendingComplianceItem[] {
  const out: PendingComplianceItem[] = []
  for (const a of associations) {
    const applicable = deadlinesForState(complianceState(a.governingLawState, a.state), todayYmd)
    if (applicable.length === 0) continue
    const acks = readComplianceAcks(a.id, a.complianceSettings, secret)
    const rows = done?.get(a.id)
    for (const d of applicable) {
      if (acks.has(d.code) || rows?.has(d.code)) continue
      const daysLeft = d.dueOn ? daysUntil(todayYmd, d.dueOn) : null
      out.push({
        associationId: a.id,
        associationName: a.name,
        deadline: d,
        daysLeft,
        tone: deadlineTone(d, daysLeft),
        label: deadlineLabel(d, todayYmd),
      })
    }
  }
  return out.sort((x, y) => {
    if (x.daysLeft === null && y.daysLeft === null) return 0
    if (x.daysLeft === null) return 1
    if (y.daysLeft === null) return -1
    return x.daysLeft - y.daysLeft
  })
}

/**
 * The items that belong in today's digest: dated, not done, and within
 * COMPLIANCE_DIGEST_WINDOW_DAYS or already in effect. Standing obligations
 * stay on the dashboard card only, so they don't email the board every day.
 */
export function complianceDigestItems(items: readonly PendingComplianceItem[]): PendingComplianceItem[] {
  return items.filter((i) => i.daysLeft !== null && i.daysLeft <= COMPLIANCE_DIGEST_WINDOW_DAYS)
}

/** One digest line: "Oak Hills HOA: Register with the Georgia Secretary of State — takes effect in 73 days (Jan 1, 2027). O.C.G.A. § 43-17A-2 (…)". */
export function complianceDigestLine(item: PendingComplianceItem): string {
  const when = item.label.charAt(0).toLowerCase() + item.label.slice(1)
  return `${item.associationName}: ${item.deadline.title} — ${when}. ${item.deadline.citation}.`
}
