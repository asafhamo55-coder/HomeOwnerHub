/**
 * Per-association config for automated dues reminders (BL-013).
 *
 * STORAGE. No migration: the config lives in
 * associations.compliance_settings[DUES_REMINDERS_KEY], next to
 * pay_by_zelle and outbound_mode, and every write preserves the other keys.
 *
 * OFF BY DEFAULT. Absent, unreadable or unverified config all mean "off".
 *
 * APPROVAL. The board approves the cadence and the message once: saving
 * from /settings/reminders stamps approved_at/approved_by and signs the
 * whole value. Any later edit is a fresh approval by whoever saves it.
 *
 * WHY SIGNED. Same reason as pay_by_zelle (apps/hoa/src/lib/pay-by-zelle.ts):
 * until migration 0063 is applied in production, `associations` still has
 * 0004's FOR ALL org_access policy, so any org member — a resident
 * included — can PATCH compliance_settings with their own session. An
 * unsigned config would let them switch reminders on with a note of their
 * choosing, mailed to every owner in the association's name. The job only
 * honours a value whose HMAC verifies with the server-only secret.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export const DUES_REMINDERS_KEY = 'dues_reminders'

export const DEFAULT_OFFSETS: readonly number[] = [-3, 5, 15]
export const OFFSET_MIN = -30
export const OFFSET_MAX = 90
export const MAX_STEPS = 5
export const NOTE_MAX = 500

const SIGNATURE_DOMAIN = 'dues-reminders:v1'

export interface DuesReminderSettings {
  enabled: boolean
  /** Days relative to the due date, ascending. −3 = three days before. */
  offsets: number[]
  /** The board's own words, shown above the balance. */
  note: string | null
}

export interface DuesReminderApproval {
  approvedAt: string
  approvedBy: string | null
}

/** The JSON object stored under compliance_settings.dues_reminders. */
export interface StoredDuesReminderSettings {
  enabled: boolean
  offsets: number[]
  note: string | null
  approved_at: string
  approved_by: string | null
  sig: string
}

export type DuesReminderReadResult =
  | { state: 'configured'; settings: DuesReminderSettings & DuesReminderApproval }
  | { state: 'not_configured' }
  /** Present but not written by the signed board save. Treated as off. */
  | { state: 'unverified' }

// ─── validation ─────────────────────────────────────────────────────

export type ValidateResult =
  | { ok: true; value: DuesReminderSettings }
  | { ok: false; fieldErrors: Record<string, string> }

export function validateDuesReminderInput(input: {
  enabled: unknown
  offsets: unknown[]
  note: unknown
}): ValidateResult {
  const fieldErrors: Record<string, string> = {}

  const raw = Array.isArray(input.offsets) ? input.offsets : []
  const offsets = [...new Set(raw)].sort((a, b) => Number(a) - Number(b))
  if (offsets.length === 0) {
    fieldErrors.offsets = 'Add at least one reminder.'
  } else if (offsets.length > MAX_STEPS) {
    fieldErrors.offsets = `Use at most ${MAX_STEPS} reminders.`
  } else if (
    offsets.some(
      (o) => typeof o !== 'number' || !Number.isInteger(o) || o < OFFSET_MIN || o > OFFSET_MAX,
    )
  ) {
    fieldErrors.offsets = `Each reminder must be a whole number of days between ${-OFFSET_MIN} before and ${OFFSET_MAX} after the due date.`
  }

  const note = typeof input.note === 'string' ? input.note.trim() : ''
  if (note.length > NOTE_MAX) fieldErrors.note = `Keep the message under ${NOTE_MAX} characters.`

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }
  return {
    ok: true,
    value: { enabled: input.enabled === true, offsets: offsets as number[], note: note || null },
  }
}

// ─── signing ────────────────────────────────────────────────────────

function payload(
  associationId: string,
  s: { enabled: boolean; offsets: number[]; note: string | null; approved_at: string; approved_by: string | null },
): string {
  return JSON.stringify([
    SIGNATURE_DOMAIN,
    associationId,
    s.enabled,
    s.offsets,
    s.note,
    s.approved_at,
    s.approved_by,
  ])
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

export function signDuesReminderSettings(
  associationId: string,
  value: DuesReminderSettings,
  approval: DuesReminderApproval,
  secret: string,
): StoredDuesReminderSettings {
  const unsigned = {
    enabled: value.enabled,
    offsets: [...value.offsets],
    note: value.note,
    approved_at: approval.approvedAt,
    approved_by: approval.approvedBy,
  }
  return { ...unsigned, sig: hmac(secret, payload(associationId, unsigned)) }
}

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function isStored(v: Record<string, unknown>): v is Record<string, unknown> & StoredDuesReminderSettings {
  return (
    typeof v.enabled === 'boolean' &&
    Array.isArray(v.offsets) &&
    v.offsets.every((o) => typeof o === 'number' && Number.isInteger(o)) &&
    (v.note === null || typeof v.note === 'string') &&
    typeof v.approved_at === 'string' &&
    (v.approved_by === null || typeof v.approved_by === 'string') &&
    typeof v.sig === 'string'
  )
}

export function readDuesReminderSettings(
  associationId: string,
  complianceSettings: unknown,
  secret: string | null,
): DuesReminderReadResult {
  const raw = asObject(complianceSettings)?.[DUES_REMINDERS_KEY]
  if (raw === undefined || raw === null) return { state: 'not_configured' }
  const obj = asObject(raw)
  if (!obj || !isStored(obj) || !secret) return { state: 'unverified' }

  const expected = Buffer.from(hmac(secret, payload(associationId, obj)), 'hex')
  const actual = Buffer.from(obj.sig, 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { state: 'unverified' }
  }
  // Re-validate even a signed value: the signer validated it, but the
  // job must never act on, say, 40 offsets because an old build allowed it.
  const checked = validateDuesReminderInput({ enabled: obj.enabled, offsets: obj.offsets, note: obj.note ?? '' })
  if (!checked.ok) return { state: 'unverified' }

  return {
    state: 'configured',
    settings: { ...checked.value, approvedAt: obj.approved_at, approvedBy: obj.approved_by },
  }
}

/** What the job and the settings screen act on: OFF unless verified. */
export function effectiveDuesReminderSettings(read: DuesReminderReadResult): DuesReminderSettings {
  if (read.state === 'configured') {
    const { enabled, offsets, note } = read.settings
    return { enabled, offsets, note }
  }
  return { enabled: false, offsets: [...DEFAULT_OFFSETS], note: null }
}

/** compliance_settings with ours replaced (or removed); other keys kept. */
export function withDuesReminderSettings(
  complianceSettings: unknown,
  stored: StoredDuesReminderSettings | null,
): Record<string, unknown> {
  const next = { ...(asObject(complianceSettings) ?? {}) }
  if (stored) next[DUES_REMINDERS_KEY] = stored
  else delete next[DUES_REMINDERS_KEY]
  return next
}
