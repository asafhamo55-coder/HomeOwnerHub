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
import { parseMemoCode } from '@homeowner-portal/workflows'
import { chargeTypeLabel } from './assessment-labels'

export const ZELLE_SETTINGS_KEY = 'pay_by_zelle'

const SIGNATURE_DOMAIN = 'pay-by-zelle:v1'
const RECIPIENT_NAME_MAX = 80
const INSTRUCTIONS_MAX = 500
/** W18 auto-matches a deposit within this of the assessment's full amount. */
const W18_AMOUNT_TOLERANCE = 0.5

export interface ZelleSettings {
  /** Email or US mobile number registered with Zelle. */
  recipient: string
  /** The name Zelle shows the payer, so they can confirm before sending. */
  recipientName: string | null
  /** Optional free text from the board (e.g. "We also accept checks at…"). */
  instructions: string | null
}

/** The JSON object stored under compliance_settings.pay_by_zelle. */
export interface StoredZelleSettings {
  recipient: string
  recipient_name: string | null
  instructions: string | null
  updated_at: string
  sig: string
}

export type ZelleReadResult =
  | { state: 'configured'; settings: ZelleSettings & { updatedAt: string } }
  | { state: 'not_configured' }
  /** Present but not written by the signed board save (or no secret). Treat as not set up. */
  | { state: 'unverified' }

// ─── secret ─────────────────────────────────────────────────────────

/**
 * Server-only signing secret. Same fallback chain as the session cap
 * (lib/supabase/middleware.ts): a dedicated secret if set, else the
 * service-role key every deployment already has. Null fails closed.
 */
export function paySettingsSecret(): string | null {
  return (
    process.env.PAY_SETTINGS_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    null
  )
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

// ─── signing ────────────────────────────────────────────────────────

function signature(associationId: string, s: ZelleSettings, updatedAt: string, secret: string): string {
  const message = JSON.stringify([
    SIGNATURE_DOMAIN,
    associationId,
    s.recipient,
    s.recipientName ?? '',
    s.instructions ?? '',
    updatedAt,
  ])
  return createHmac('sha256', secret).update(message).digest('base64url')
}

export function signZelleSettings(
  associationId: string,
  settings: ZelleSettings,
  secret: string,
  updatedAt: string = new Date().toISOString(),
): StoredZelleSettings {
  return {
    recipient: settings.recipient,
    recipient_name: settings.recipientName,
    instructions: settings.instructions,
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
): ZelleReadResult {
  const raw = asObject(asObject(complianceSettings)?.[ZELLE_SETTINGS_KEY])
  if (!raw) return { state: 'not_configured' }

  const recipient = strOrNull(raw.recipient)
  const updatedAt = strOrNull(raw.updated_at)
  const sig = strOrNull(raw.sig)
  if (!recipient || !updatedAt || !sig || !secret) return { state: 'unverified' }

  const settings: ZelleSettings = {
    recipient,
    recipientName: strOrNull(raw.recipient_name),
    instructions: strOrNull(raw.instructions),
  }
  const expected = Buffer.from(signature(associationId, settings, updatedAt, secret))
  const actual = Buffer.from(sig)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { state: 'unverified' }

  return { state: 'configured', settings: { ...settings, updatedAt } }
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

/** One Zelle payment per open charge, oldest due date first. */
export function payLinesFor(charges: PayLineInput[]): PayLine[] {
  return [...charges]
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.id < b.id ? -1 : 1))
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
