/**
 * BL-173: which seasonal nudges the board has dismissed.
 *
 * STORAGE. No migration: a list under
 * associations.compliance_settings.announcement_nudges, next to
 * pay_by_zelle, resident_notifications and the compliance acknowledgments.
 * Every write keeps the other keys.
 *
 * WHY SIGNED. Same reason as those: until migration 0063 is applied in
 * production, any org member can PATCH compliance_settings with their own
 * session. Only an entry whose HMAC verifies with the server-only secret
 * (paySettingsSecret) counts as dismissed; anything else is ignored, so a
 * forged or unreadable value can only ever show a nudge, never hide one.
 *
 * Server-only (node:crypto). Never import from a client component.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { isNudgeKey } from './nudge'

export const NUDGE_SETTINGS_KEY = 'announcement_nudges'
const SIGNATURE_DOMAIN = 'announcement-nudge:v1'
/** Old entries fall off; a key is `<occasion>:<year>`, so they expire anyway. */
export const MAX_STORED_DISMISSALS = 24

export interface StoredDismissal {
  key: string
  at: string
  by: string | null
  sig: string
}

function payload(associationId: string, key: string, at: string, by: string | null): string {
  return JSON.stringify([SIGNATURE_DOMAIN, associationId, key, at, by])
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

export function signDismissal(
  associationId: string,
  key: string,
  stamp: { at: string; by: string | null },
  secret: string,
): StoredDismissal {
  return { key, at: stamp.at, by: stamp.by, sig: hmac(secret, payload(associationId, key, stamp.at, stamp.by)) }
}

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function entriesOf(complianceSettings: unknown): unknown[] {
  const list = asObject(asObject(complianceSettings)?.[NUDGE_SETTINGS_KEY])?.dismissed
  return Array.isArray(list) ? list : []
}

function verified(associationId: string, raw: unknown, secret: string): StoredDismissal | null {
  const e = asObject(raw)
  if (!e) return null
  if (typeof e.key !== 'string' || typeof e.at !== 'string' || typeof e.sig !== 'string') return null
  if (e.by !== null && typeof e.by !== 'string') return null
  const expected = Buffer.from(hmac(secret, payload(associationId, e.key, e.at, e.by)), 'hex')
  let given: Buffer
  try {
    given = Buffer.from(e.sig, 'hex')
  } catch {
    return null
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  return { key: e.key, at: e.at, by: e.by, sig: e.sig }
}

/** The nudge keys with a valid signed dismissal. No secret: none. */
export function readDismissedKeys(
  associationId: string,
  complianceSettings: unknown,
  secret: string | null,
): Set<string> {
  const out = new Set<string>()
  if (!secret) return out
  for (const raw of entriesOf(complianceSettings)) {
    const e = verified(associationId, raw, secret)
    if (e && isNudgeKey(e.key)) out.add(e.key)
  }
  return out
}

/**
 * compliance_settings with one more dismissal, every other key kept. Other
 * stored entries are carried over unchanged (verified or not: a write must
 * not erase a value another writer put there), newest last, capped.
 */
export function withDismissal(complianceSettings: unknown, entry: StoredDismissal): Record<string, unknown> {
  const base = asObject(complianceSettings) ?? {}
  const kept = entriesOf(complianceSettings).filter((raw) => asObject(raw)?.key !== entry.key)
  const dismissed = [...kept, entry].slice(-MAX_STORED_DISMISSALS)
  return { ...base, [NUDGE_SETTINGS_KEY]: { dismissed } }
}
