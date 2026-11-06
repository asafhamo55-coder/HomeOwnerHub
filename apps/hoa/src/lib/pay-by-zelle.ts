// Pay-by-Zelle (ADR-005, backlog BL-006): the board's Zelle recipient and the
// per-charge memo codes W18 matches deposits against.
//
// Pure module (node:crypto only) — imported by server components, the
// board's save action, the ui-shots seed and unit tests. Never import it
// from a client component.
//
// STORAGE. No migration: the settings live in
// associations.compliance_settings[ZELLE_SETTINGS_KEY].
//
// WHY THEY ARE SIGNED. associations still carries 0004's FOR ALL
// `org_access` policy (organization_id = ANY(auth_org_ids())), so any org
// member — a resident included — can PATCH compliance_settings through the
// REST API with their own session. Unsigned, that would let one resident
// re-point every neighbour's dues to their own Zelle. The board's save
// action signs the value with a server-only secret and the resident screen
// shows a recipient only when the signature verifies; anything else reads
// as "not set up". Closing the policy itself is BL-007's migration batch.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { resolveSigningSecret } from './signing-secret'
import { parseMemoCode } from '@homeowner-portal/workflows'
import { chargeTypeLabel } from './assessment-labels'
import { allocationMode, orderForPayLines } from './collections/ga-payment-order'

export const ZELLE_SETTINGS_KEY = 'pay_by_zelle'

const SIGNATURE_DOMAIN = 'pay-by-zelle:v1'
const RECIPIENT_NAME_MAX = 80
const INSTRUCTIONS_MAX = 500
/** W18 auto-matches a deposit within this of the assessment's full amount. */
const W18_AMOUNT_TOLERANCE = 0.5

/** How to pay by check (round 29). Plain text the board types; residents read it. */
export interface CheckSettings {
  /** "Make checks payable to". */
  payableTo: string
  /** Mailing address for checks. */
  mailTo: string
  /** Optional place to hand a check in. */
  dropOff: string | null
}

export interface ZelleSettings {
  /** Email or US mobile number registered with Zelle. */
  recipient: string
  /** The name Zelle shows the payer, so they can confirm before sending. */
  recipientName: string | null
  /** Optional free text from the board (e.g. "We also accept checks at…"). */
  instructions: string | null
  /** Present when the board also takes checks. */
  checks?: CheckSettings | null
}

/**
 * What the board saves under "How residents pay": Zelle, checks, or both.
 * At least one must be present (validatePaymentSettingsInput enforces it).
 */
export interface PaymentSettings {
  recipient: string | null
  recipientName: string | null
  instructions: string | null
  checks: CheckSettings | null
}

/** The JSON object stored under compliance_settings.pay_by_zelle. */
export interface StoredZelleSettings {
  /** Null when the board takes checks only. */
  recipient: string | null
  recipient_name: string | null
  instructions: string | null
  check_payable_to?: string | null
  check_mail_to?: string | null
  check_drop_off?: string | null
  updated_at: string
  sig: string
}

export type ZelleReadResult =
  | { state: 'configured'; settings: ZelleSettings & { updatedAt: string } }
  /** Verified, no Zelle recipient, checks only. Treat as "not Zelle" anywhere that needs a recipient. */
  | { state: 'checks_only'; settings: { recipientName: string | null; instructions: string | null; checks: CheckSettings; updatedAt: string } }
  | { state: 'not_configured' }
  /** Present but not written by the signed board save (or no secret). Treat as not set up. */
  | { state: 'unverified' }

// ─── secret ─────────────────────────────────────────────────────────

/**
 * Server-only signing secret. PAY_SETTINGS_SECRET is required in production:
 * a missing value returns null (logged once by name, never a value) instead of falling
 * back to the service-role key. Outside production the fallback stays for
 * local runs and tests (see signing-secret.ts). Rotation is covered by
 * paySettingsPreviousSecret() below.
 */
export function paySettingsSecret(env: Record<string, string | undefined> = process.env): string | null {
  return resolveSigningSecret('PAY_SETTINGS_SECRET', env)
}

/**
 * The secret settings were signed with before the last rotation, accepted
 * for VERIFYING the Zelle recipient only (never for signing), so a board's
 * Zelle setup keeps showing to residents while PAY_SETTINGS_SECRET changes.
 * Set PAY_SETTINGS_SECRET_PREVIOUS to the old value (the service-role key,
 * if the fallback was in use) for the transition; remove it once boards
 * have re-saved. Other signed settings (reminders, notices, receipts, the
 * assistant, ARC clock, quorum kit, compliance acks) do not read it: after
 * a rotation they read as off / not set up until the board saves them
 * again (fail closed).
 */
export function paySettingsPreviousSecret(env: Record<string, string | undefined> = process.env): string | null {
  return env.PAY_SETTINGS_SECRET_PREVIOUS || null
}

// ─── validation ─────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isUsPhone(value: string): boolean {
  if (!/^[\d\s()+.-]+$/.test(value)) return false
  const digits = value.replace(/\D/g, '')
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))
}

function clean(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

export function validateZelleInput(input: {
  recipient?: string | null
  recipientName?: string | null
  instructions?: string | null
}): { ok: true; value: ZelleSettings } | { ok: false; fieldErrors: Record<string, string> } {
  const recipient = clean(input.recipient)
  const recipientName = clean(input.recipientName)
  const instructions = clean(input.instructions)
  const fieldErrors: Record<string, string> = {}

  if (!recipient) fieldErrors.recipient = 'Enter the email or US mobile number your association’s Zelle is registered to.'
  else if (recipient.length > 254 || !(EMAIL_RE.test(recipient) || isUsPhone(recipient)))
    fieldErrors.recipient = 'Use an email address or a 10-digit US mobile number.'
  if (recipientName && recipientName.length > RECIPIENT_NAME_MAX)
    fieldErrors.recipientName = `Keep it under ${RECIPIENT_NAME_MAX} characters.`
  if (instructions && instructions.length > INSTRUCTIONS_MAX)
    fieldErrors.instructions = `Keep it under ${INSTRUCTIONS_MAX} characters.`

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }
  return { ok: true, value: { recipient: recipient!, recipientName, instructions } }
}

const CHECK_FIELD_MAX = 160
const CHECK_ADDRESS_MAX = 300

/**
 * The board's "How residents pay" form. Zelle is optional, checks are
 * optional, but at least one way to pay is required. Messages are written
 * for a volunteer who may be 70 and on a phone.
 */
export function validatePaymentSettingsInput(input: {
  recipient?: string | null
  recipientName?: string | null
  instructions?: string | null
  checkPayableTo?: string | null
  checkMailTo?: string | null
  checkDropOff?: string | null
}): { ok: true; value: PaymentSettings } | { ok: false; fieldErrors: Record<string, string> } {
  const recipient = clean(input.recipient)
  const recipientName = clean(input.recipientName)
  const instructions = clean(input.instructions)
  const payableTo = clean(input.checkPayableTo)
  const mailTo = clean(input.checkMailTo)
  const dropOff = clean(input.checkDropOff)
  const fieldErrors: Record<string, string> = {}

  if (recipient && (recipient.length > 254 || !(EMAIL_RE.test(recipient) || isUsPhone(recipient))))
    fieldErrors.recipient = 'Use an email address or a 10-digit US mobile number.'
  if (recipientName && recipientName.length > RECIPIENT_NAME_MAX)
    fieldErrors.recipientName = `Keep it under ${RECIPIENT_NAME_MAX} characters.`
  if (instructions && instructions.length > INSTRUCTIONS_MAX)
    fieldErrors.instructions = `Keep it under ${INSTRUCTIONS_MAX} characters.`

  const anyCheck = Boolean(payableTo || mailTo || dropOff)
  if (anyCheck) {
    if (!payableTo) fieldErrors.checkPayableTo = 'Enter who checks should be made out to.'
    else if (payableTo.length > CHECK_FIELD_MAX) fieldErrors.checkPayableTo = `Keep it under ${CHECK_FIELD_MAX} characters.`
    if (!mailTo) fieldErrors.checkMailTo = 'Enter the address residents should mail checks to.'
    else if (mailTo.length > CHECK_ADDRESS_MAX) fieldErrors.checkMailTo = `Keep it under ${CHECK_ADDRESS_MAX} characters.`
    if (dropOff && dropOff.length > CHECK_ADDRESS_MAX) fieldErrors.checkDropOff = `Keep it under ${CHECK_ADDRESS_MAX} characters.`
  }
  if (!recipient && !anyCheck) {
    fieldErrors.recipient = 'Add a Zelle email or number, or fill in the check details below, so residents know how to pay.'
    fieldErrors.checkPayableTo = 'Fill this in if you take checks.'
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }
  return {
    ok: true,
    value: {
      recipient,
      recipientName,
      instructions,
      checks: anyCheck ? { payableTo: payableTo!, mailTo: mailTo!, dropOff } : null,
    },
  }
}

// ─── signing ────────────────────────────────────────────────────────

type Signable = {
  recipient: string | null
  recipientName: string | null
  instructions: string | null
  checks?: CheckSettings | null
}

function signature(associationId: string, s: Signable, updatedAt: string, secret: string): string {
  const parts: unknown[] = [
    SIGNATURE_DOMAIN,
    associationId,
    s.recipient ?? '',
    s.recipientName ?? '',
    s.instructions ?? '',
    updatedAt,
  ]
  // Check fields join the signed message only when present, so a Zelle-only
  // setup saved before checks existed still verifies, and adding or removing
  // check fields outside the signed save breaks the signature.
  if (s.checks) parts.push([s.checks.payableTo, s.checks.mailTo, s.checks.dropOff ?? ''])
  const message = JSON.stringify(parts)
  return createHmac('sha256', secret).update(message).digest('base64url')
}

export function signZelleSettings(
  associationId: string,
  settings: Signable,
  secret: string,
  updatedAt: string = new Date().toISOString(),
): StoredZelleSettings {
  return {
    recipient: settings.recipient,
    recipient_name: settings.recipientName,
    instructions: settings.instructions,
    ...(settings.checks
      ? {
          check_payable_to: settings.checks.payableTo,
          check_mail_to: settings.checks.mailTo,
          check_drop_off: settings.checks.dropOff,
        }
      : {}),
    updated_at: updatedAt,
    sig: signature(associationId, settings, updatedAt, secret),
  }
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

export function readZelleSettings(
  associationId: string,
  complianceSettings: unknown,
  secret: string | null,
  /** SEC-N7: also accepted for verification during a rotation. */
  previousSecret: string | null = paySettingsPreviousSecret(),
): ZelleReadResult {
  const raw = asObject(asObject(complianceSettings)?.[ZELLE_SETTINGS_KEY])
  if (!raw) return { state: 'not_configured' }

  const recipient = strOrNull(raw.recipient)
  const updatedAt = strOrNull(raw.updated_at)
  const sig = strOrNull(raw.sig)
  const payableTo = strOrNull(raw.check_payable_to)
  const mailTo = strOrNull(raw.check_mail_to)
  // Half-filled check details are never shown: both parts or none.
  if ((payableTo == null) !== (mailTo == null)) return { state: 'unverified' }
  const checks: CheckSettings | null =
    payableTo && mailTo ? { payableTo, mailTo, dropOff: strOrNull(raw.check_drop_off) } : null
  if ((!recipient && !checks) || !updatedAt || !sig || !secret) return { state: 'unverified' }

  const settings = {
    recipient,
    recipientName: strOrNull(raw.recipient_name),
    instructions: strOrNull(raw.instructions),
    checks,
  }
  const actual = Buffer.from(sig)
  const matches = (key: string) => {
    const expected = Buffer.from(signature(associationId, settings, updatedAt, key))
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  }
  if (!matches(secret) && !(previousSecret && previousSecret !== secret && matches(previousSecret))) return { state: 'unverified' }

  if (!recipient) {
    return {
      state: 'checks_only',
      settings: { recipientName: settings.recipientName, instructions: settings.instructions, checks: checks!, updatedAt },
    }
  }
  return {
    state: 'configured',
    settings: {
      recipient,
      recipientName: settings.recipientName,
      instructions: settings.instructions,
      ...(checks ? { checks } : {}),
      updatedAt,
    },
  }
}

/** The check details to show residents, from either verified state. */
export function checksOf(read: ZelleReadResult): CheckSettings | null {
  if (read.state === 'checks_only') return read.settings.checks
  if (read.state === 'configured') return read.settings.checks ?? null
  return null
}

/** compliance_settings with pay_by_zelle replaced (or removed when null); other keys untouched. */
export function withZelleSettings(
  complianceSettings: unknown,
  stored: StoredZelleSettings | Omit<StoredZelleSettings, 'sig'> | null,
): Record<string, unknown> {
  const next = { ...(asObject(complianceSettings) ?? {}) }
  if (stored) next[ZELLE_SETTINGS_KEY] = stored
  else delete next[ZELLE_SETTINGS_KEY]
  return next
}

// ─── memo codes and pay lines ───────────────────────────────────────

/**
 * The stored assessments.memo_code, only if W18 would find the assessment
 * from it: W18 parses the bank memo to its canonical form and looks the
 * assessment up by `memo_code = canonical`, so a stored value that is not
 * already canonical can never match and must not be shown as if it would.
 */
export function usableMemoCode(memoCode: string | null | undefined): string | null {
  if (!memoCode) return null
  const parsed = parseMemoCode(memoCode)
  return parsed && parsed.canonical === memoCode ? memoCode : null
}

export interface PayLineInput {
  id: string
  assessmentType: string
  dueDate: string
  /** Remaining owed. */
  amount: number
  /** The assessment's full amount (what W18 compares the deposit to). */
  fullAmount: number
  memoCode: string | null
}

export interface PayLine {
  assessmentId: string
  label: string
  dueDate: string
  amount: number
  memoCode: string | null
  /**
   * W18 can match this payment on its own (exact memo + amount). False for a
   * charge with no usable memo code or one already partly paid — those still
   * arrive, but the board matches them by hand.
   */
  autoMatch: boolean
}

/**
 * One Zelle payment per open charge. Oldest due date first, except for a
 * Georgia association from January 1, 2027 (BL-163, § 43-17A-8): regular
 * assessments (dues) first, then special assessments, then specific
 * assessments, then other fees and fines, oldest first within each, so
 * the first line is the one to pay first. `order` is the association's
 * governing-law state and its today; without it (or before the date, or
 * outside Georgia) nothing changes. Lines are only reordered, never
 * dropped or re-priced.
 */
export function payLinesFor(
  charges: PayLineInput[],
  order?: { state: string | null | undefined; today: string; planInstallmentIds?: ReadonlySet<string> },
): PayLine[] {
  const mode = order ? allocationMode(order.state, order.today) : 'oldest_first'
  return orderForPayLines(charges, mode, order?.today ?? '', order?.planInstallmentIds)
    .map((c) => {
      const memoCode = usableMemoCode(c.memoCode)
      return {
        assessmentId: c.id,
        label: chargeTypeLabel(c.assessmentType),
        dueDate: c.dueDate,
        amount: c.amount,
        memoCode,
        autoMatch: memoCode != null && Math.abs(c.amount - c.fullAmount) <= W18_AMOUNT_TOLERANCE,
      }
    })
}
