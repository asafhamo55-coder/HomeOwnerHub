/**
 * Per-association vendor insurance settings (BL-083 / BL-084):
 *
 *   - the minimum coverage a vendor's certificate of insurance must show
 *     (general liability per occurrence and aggregate, workers' comp,
 *     auto liability, umbrella) — read by the W21 compliance check and
 *     copied into every W22 RFP draft and RFP invitation
 *   - whether the daily job reminds the BOARD (in-app notice) before a
 *     vendor's COI expires (on by default; this is the board's opt-out).
 *     Owner rule 2026-10-20: nothing emails a vendor automatically; the
 *     board sends "Request updated certificate" by hand from the vendor
 *     page. The stored key keeps its old name (coi_reminders_enabled).
 *
 * STORAGE. No migration: the value lives in
 * associations.compliance_settings[VENDOR_INSURANCE_KEY], next to
 * pay_by_zelle and dues_reminders. Every write keeps the other keys.
 *
 * WHY SIGNED. Same reason as pay_by_zelle and dues_reminders: until
 * migration 0063 is applied in production, any org member — a resident
 * included — can PATCH compliance_settings with their own session.
 * Unsigned, a resident could lower the association's insurance minimums
 * so an under-insured vendor grades green. Only a value whose HMAC
 * verifies with the server-only secret is honoured; anything else reads
 * as "not saved" and the defaults apply.
 *
 * DEFAULTS = TODAY'S BEHAVIOUR. Before this screen, W21 read three
 * unsigned top-level keys (gl_per_occurrence_min, gl_aggregate_min,
 * workers_comp_required) that nothing in the app ever wrote, so in
 * practice no minimum applied. With nothing saved, those legacy keys are
 * still honoured exactly as before; a board save replaces and strips them.
 *
 * Pure (node:crypto only). Server-only — never import from a client
 * component.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export const VENDOR_INSURANCE_KEY = 'vendor_insurance'

const SIGNATURE_DOMAIN = 'vendor-insurance:v1'

/** No association's minimum is $100M; past this it is a typo. */
export const COVERAGE_MAX = 100_000_000

/** The unsigned top-level keys W21 used to read (see DEFAULTS above). */
const LEGACY_KEYS = ['gl_per_occurrence_min', 'gl_aggregate_min', 'workers_comp_required', 'umbrella_min'] as const

export interface InsuranceMinimums {
  /** Whole dollars, or null for "no minimum". */
  glPerOccurrenceMin: number | null
  glAggregateMin: number | null
  workersCompRequired: boolean
  autoLiabilityMin: number | null
  /** Umbrella / excess liability. */
  umbrellaMin: number | null
}

export interface VendorInsuranceSettings {
  coiRemindersEnabled: boolean
  minimums: InsuranceMinimums
}

export interface VendorInsuranceStamp {
  updatedAt: string
  updatedBy: string | null
}

/** The JSON stored under compliance_settings.vendor_insurance. */
export interface StoredVendorInsuranceSettings {
  coi_reminders_enabled: boolean
  gl_per_occurrence_min: number | null
  gl_aggregate_min: number | null
  workers_comp_required: boolean
  auto_liability_min: number | null
  /** Absent on rows signed before umbrella existed; those still verify. */
  umbrella_min?: number | null
  updated_at: string
  updated_by: string | null
  sig: string
}

export type VendorInsuranceReadResult =
  | ({ state: 'configured'; settings: VendorInsuranceSettings } & VendorInsuranceStamp)
  | { state: 'not_configured' }
  /** Present but not written by the signed board save. Defaults apply. */
  | { state: 'unverified' }

export const NO_MINIMUMS: InsuranceMinimums = {
  glPerOccurrenceMin: null,
  glAggregateMin: null,
  workersCompRequired: false,
  autoLiabilityMin: null,
  umbrellaMin: null,
}

export const DEFAULT_VENDOR_INSURANCE_SETTINGS: VendorInsuranceSettings = {
  coiRemindersEnabled: true,
  minimums: NO_MINIMUMS,
}

// ─── secret ─────────────────────────────────────────────────────────

/** Same server-only secret and fallback chain as apps/hoa's
 *  paySettingsSecret; the domain string keeps the signatures apart. */
export function vendorInsuranceSettingsSecret(): string | null {
  return (
    process.env.PAY_SETTINGS_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || null
  )
}

// ─── validation ─────────────────────────────────────────────────────

export type VendorInsuranceValidateResult =
  | { ok: true; value: VendorInsuranceSettings }
  | { ok: false; fieldErrors: Record<string, string> }

const LABELS = {
  glPerOccurrenceMin: 'General liability per occurrence',
  glAggregateMin: 'General liability aggregate',
  autoLiabilityMin: 'Auto liability',
  umbrellaMin: 'Umbrella',
} as const

/** '' / null → null; '1,000,000' / '$1000000' / 1000000 → 1000000; else an error. */
function parseDollars(v: unknown): { ok: true; value: number | null } | { ok: false } {
  if (v === null || v === undefined) return { ok: true, value: null }
  if (typeof v === 'number') return Number.isInteger(v) && v > 0 && v <= COVERAGE_MAX ? { ok: true, value: v } : { ok: false }
  if (typeof v !== 'string') return { ok: false }
  const t = v.trim().replace(/^\$/, '').replace(/,/g, '')
  if (t === '') return { ok: true, value: null }
  if (!/^\d+$/.test(t)) return { ok: false }
  const n = Number(t)
  return n > 0 && n <= COVERAGE_MAX ? { ok: true, value: n } : { ok: false }
}

export function validateVendorInsuranceInput(input: {
  coiRemindersEnabled: unknown
  glPerOccurrenceMin?: unknown
  glAggregateMin?: unknown
  workersCompRequired: unknown
  autoLiabilityMin?: unknown
  umbrellaMin?: unknown
}): VendorInsuranceValidateResult {
  const fieldErrors: Record<string, string> = {}
  const amounts: Partial<Record<keyof typeof LABELS, number | null>> = {}
  for (const key of Object.keys(LABELS) as Array<keyof typeof LABELS>) {
    const parsed = parseDollars(input[key])
    if (parsed.ok) amounts[key] = parsed.value
    else fieldErrors[key] = `Enter whole dollars between $1 and $${COVERAGE_MAX.toLocaleString('en-US')}, or leave it blank.`
  }
  const per = amounts.glPerOccurrenceMin ?? null
  const agg = amounts.glAggregateMin ?? null
  if (!fieldErrors.glAggregateMin && per !== null && agg !== null && agg < per) {
    fieldErrors.glAggregateMin = 'The aggregate must be at least the per-occurrence amount.'
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }
  return {
    ok: true,
    value: {
      coiRemindersEnabled: input.coiRemindersEnabled === true,
      minimums: {
        glPerOccurrenceMin: per,
        glAggregateMin: agg,
        workersCompRequired: input.workersCompRequired === true,
        autoLiabilityMin: amounts.autoLiabilityMin ?? null,
        umbrellaMin: amounts.umbrellaMin ?? null,
      },
    },
  }
}

// ─── signing ────────────────────────────────────────────────────────

type Unsigned = Omit<StoredVendorInsuranceSettings, 'sig'>

function payload(associationId: string, s: Unsigned): string {
  const fields: unknown[] = [
    SIGNATURE_DOMAIN,
    associationId,
    s.coi_reminders_enabled,
    s.gl_per_occurrence_min,
    s.gl_aggregate_min,
    s.workers_comp_required,
    s.auto_liability_min,
    s.updated_at,
    s.updated_by,
  ]
  // Umbrella joined the payload later. A row signed before it existed has
  // no key and verifies against the original payload; every new save
  // writes the key, so stripping or adding it breaks the signature.
  if (s.umbrella_min !== undefined) fields.push(['umbrella', s.umbrella_min])
  return JSON.stringify(fields)
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

export function signVendorInsuranceSettings(
  associationId: string,
  value: VendorInsuranceSettings,
  stamp: VendorInsuranceStamp,
  secret: string,
): StoredVendorInsuranceSettings {
  const unsigned: Unsigned = {
    coi_reminders_enabled: value.coiRemindersEnabled,
    gl_per_occurrence_min: value.minimums.glPerOccurrenceMin,
    gl_aggregate_min: value.minimums.glAggregateMin,
    workers_comp_required: value.minimums.workersCompRequired,
    auto_liability_min: value.minimums.autoLiabilityMin,
    umbrella_min: value.minimums.umbrellaMin,
    updated_at: stamp.updatedAt,
    updated_by: stamp.updatedBy,
  }
  return { ...unsigned, sig: hmac(secret, payload(associationId, unsigned)) }
}

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

const amountOrNull = (v: unknown) => v === null || (typeof v === 'number' && Number.isInteger(v))

function isStored(v: Record<string, unknown>): v is Record<string, unknown> & StoredVendorInsuranceSettings {
  return (
    typeof v.coi_reminders_enabled === 'boolean' &&
    amountOrNull(v.gl_per_occurrence_min) &&
    amountOrNull(v.gl_aggregate_min) &&
    typeof v.workers_comp_required === 'boolean' &&
    amountOrNull(v.auto_liability_min) &&
    (v.umbrella_min === undefined || amountOrNull(v.umbrella_min)) &&
    typeof v.updated_at === 'string' &&
    (v.updated_by === null || typeof v.updated_by === 'string') &&
    typeof v.sig === 'string'
  )
}

export function readVendorInsuranceSettings(
  associationId: string,
  complianceSettings: unknown,
  secret: string | null,
): VendorInsuranceReadResult {
  const raw = asObject(complianceSettings)?.[VENDOR_INSURANCE_KEY]
  if (raw === undefined || raw === null) return { state: 'not_configured' }
  const obj = asObject(raw)
  if (!obj || !isStored(obj) || !secret) return { state: 'unverified' }

  const expected = Buffer.from(hmac(secret, payload(associationId, obj)), 'hex')
  const actual = Buffer.from(obj.sig, 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { state: 'unverified' }

  // Re-validate a signed value too: never act on what an older build allowed.
  const checked = validateVendorInsuranceInput({
    coiRemindersEnabled: obj.coi_reminders_enabled,
    glPerOccurrenceMin: obj.gl_per_occurrence_min,
    glAggregateMin: obj.gl_aggregate_min,
    workersCompRequired: obj.workers_comp_required,
    autoLiabilityMin: obj.auto_liability_min,
    umbrellaMin: obj.umbrella_min ?? null,
  })
  if (!checked.ok) return { state: 'unverified' }
  return { state: 'configured', settings: checked.value, updatedAt: obj.updated_at, updatedBy: obj.updated_by }
}

/** The pre-BL-084 minimums: unsigned top-level keys, as W21 read them. */
function legacyMinimums(complianceSettings: unknown): InsuranceMinimums {
  const cs = asObject(complianceSettings) ?? {}
  const amount = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
  return {
    glPerOccurrenceMin: amount(cs.gl_per_occurrence_min),
    glAggregateMin: amount(cs.gl_aggregate_min),
    workersCompRequired: cs.workers_comp_required === true,
    autoLiabilityMin: null,
    // W21 read this unsigned key before umbrella had a screen.
    umbrellaMin: amount(cs.umbrella_min),
  }
}

/** What the job, W21, W22 and the RFP invitation act on. */
export function effectiveVendorInsuranceSettings(
  read: VendorInsuranceReadResult,
  complianceSettings: unknown,
): VendorInsuranceSettings {
  if (read.state === 'configured') return read.settings
  return { coiRemindersEnabled: true, minimums: legacyMinimums(complianceSettings) }
}

/** One call for readers that hold the raw compliance_settings. */
export function resolveVendorInsuranceSettings(
  associationId: string,
  complianceSettings: unknown,
  secret: string | null = vendorInsuranceSettingsSecret(),
): VendorInsuranceSettings {
  return effectiveVendorInsuranceSettings(
    readVendorInsuranceSettings(associationId, complianceSettings, secret),
    complianceSettings,
  )
}

/** compliance_settings with ours replaced (or removed) and the legacy
 *  top-level minimums dropped; every other key kept. */
export function withVendorInsuranceSettings(
  complianceSettings: unknown,
  stored: StoredVendorInsuranceSettings | null,
): Record<string, unknown> {
  const next = { ...(asObject(complianceSettings) ?? {}) }
  if (stored) {
    next[VENDOR_INSURANCE_KEY] = stored
    for (const k of LEGACY_KEYS) delete next[k]
  } else delete next[VENDOR_INSURANCE_KEY]
  return next
}

// ─── consumers ──────────────────────────────────────────────────────

/**
 * The RFP's insurance_requirements: only the minimums that are set, in
 * the snake_case shape W22's prompt copies verbatim. Null when nothing is
 * set. Replaces W22 passing the whole compliance_settings blob — signed
 * Zelle and reminder values included — to the model.
 */
export function rfpInsuranceRequirements(settings: VendorInsuranceSettings): Record<string, number | boolean> | null {
  const m = settings.minimums
  const out: Record<string, number | boolean> = {}
  if (m.glPerOccurrenceMin !== null) out.gl_per_occurrence_min = m.glPerOccurrenceMin
  if (m.glAggregateMin !== null) out.gl_aggregate_min = m.glAggregateMin
  if (m.workersCompRequired) out.workers_comp_required = true
  if (m.autoLiabilityMin !== null) out.auto_liability_min = m.autoLiabilityMin
  if (m.umbrellaMin !== null) out.umbrella_min = m.umbrellaMin
  return Object.keys(out).length > 0 ? out : null
}

/** Plain-language lines for an email or page ("General liability: $1,000,000 per occurrence"). */
export function insuranceRequirementLines(m: InsuranceMinimums): string[] {
  const usd = (n: number) => `$${n.toLocaleString('en-US')}`
  const lines: string[] = []
  if (m.glPerOccurrenceMin !== null || m.glAggregateMin !== null) {
    const parts = [
      m.glPerOccurrenceMin !== null ? `${usd(m.glPerOccurrenceMin)} per occurrence` : null,
      m.glAggregateMin !== null ? `${usd(m.glAggregateMin)} aggregate` : null,
    ].filter(Boolean)
    lines.push(`General liability: ${parts.join(', ')}`)
  }
  if (m.workersCompRequired) lines.push('Workers’ compensation: required')
  if (m.autoLiabilityMin !== null) lines.push(`Auto liability: ${usd(m.autoLiabilityMin)}`)
  if (m.umbrellaMin !== null) lines.push(`Umbrella / excess liability: ${usd(m.umbrellaMin)}`)
  return lines
}

export interface MinimumsDeficiency {
  code: 'gl_below_minimum' | 'gl_aggregate_below_minimum' | 'wc_missing' | 'auto_below_minimum' | 'umbrella_below_minimum'
  severity: 'red'
  detail: string
}

/**
 * The deterministic half of the compliance check: a coverage the
 * certificate SHOWS below a minimum the association SET. A value not
 * entered is left to the grader (W21's rule 5: never invent fields).
 */
export function minimumsDeficiencies(
  m: InsuranceMinimums,
  coi: {
    generalLiabilityPerOccurrence: number | null
    generalLiabilityAggregate: number | null
    workersComp: boolean | null
    autoLiability: number | null
    /** Optional so callers that never extracted umbrella still compile. */
    umbrella?: number | null
  } | null,
): MinimumsDeficiency[] {
  if (!coi) return []
  const usd = (n: number) => `$${n.toLocaleString('en-US')}`
  const out: MinimumsDeficiency[] = []
  const below = (have: number | null, need: number | null) => have !== null && need !== null && have < need
  if (below(coi.generalLiabilityPerOccurrence, m.glPerOccurrenceMin)) {
    out.push({
      code: 'gl_below_minimum',
      severity: 'red',
      detail: `General liability per occurrence is ${usd(coi.generalLiabilityPerOccurrence!)} but the association requires ${usd(m.glPerOccurrenceMin!)}.`,
    })
  }
  if (below(coi.generalLiabilityAggregate, m.glAggregateMin)) {
    out.push({
      code: 'gl_aggregate_below_minimum',
      severity: 'red',
      detail: `General liability aggregate is ${usd(coi.generalLiabilityAggregate!)} but the association requires ${usd(m.glAggregateMin!)}.`,
    })
  }
  if (m.workersCompRequired && coi.workersComp === false) {
    out.push({
      code: 'wc_missing',
      severity: 'red',
      detail: 'The certificate shows no workers’ compensation coverage, and the association requires it.',
    })
  }
  if (below(coi.autoLiability, m.autoLiabilityMin)) {
    out.push({
      code: 'auto_below_minimum',
      severity: 'red',
      detail: `Auto liability is ${usd(coi.autoLiability!)} but the association requires ${usd(m.autoLiabilityMin!)}.`,
    })
  }
  if (below(coi.umbrella ?? null, m.umbrellaMin)) {
    out.push({
      code: 'umbrella_below_minimum',
      severity: 'red',
      detail: `Umbrella coverage is ${usd(coi.umbrella!)} but the association requires ${usd(m.umbrellaMin!)}.`,
    })
  }
  return out
}
