/**
 * BL-096 — the association's "Resident assistant" switch.
 *
 * STORAGE. No migration: associations.compliance_settings[RESIDENT_ASSISTANT_KEY],
 * next to pay_by_zelle, resident_notifications and vendor_insurance. Every
 * write keeps the other keys.
 *
 * WHY SIGNED. Same reason as those (lib/resident-notify/settings.ts): until
 * 0063 is applied any org member can PATCH compliance_settings with their
 * own session. Only a value whose HMAC verifies with the server-only secret
 * (paySettingsSecret) is the board's.
 *
 * DEFAULT ON. A missing value means the board never touched the switch:
 * the assistant is on. A value that is present but does NOT verify (written
 * outside the board's save, or the secret is gone) reads as OFF: a board
 * that turned it off must not be turned back on by a forged row, and OFF
 * only means residents get today's Ask the Docs.
 *
 * Pure (node:crypto only). Server-only.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export const RESIDENT_ASSISTANT_KEY = 'resident_assistant'

const SIGNATURE_DOMAIN = 'resident-assistant:v1'

export interface ResidentAssistantStamp {
  updatedAt: string
  updatedBy: string | null
}

/** The JSON stored under compliance_settings.resident_assistant. */
export interface StoredResidentAssistantSettings {
  enabled: boolean
  updated_at: string
  updated_by: string | null
  sig: string
}

export type ResidentAssistantReadResult =
  | ({ state: 'configured'; enabled: boolean } & ResidentAssistantStamp)
  | { state: 'not_configured' }
  /** Present but not written by the signed board save. Reads as OFF. */
  | { state: 'unverified' }

type Unsigned = Omit<StoredResidentAssistantSettings, 'sig'>

function payload(associationId: string, s: Unsigned): string {
  return JSON.stringify([SIGNATURE_DOMAIN, associationId, s.enabled, s.updated_at, s.updated_by])
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

export function signResidentAssistantSettings(
  associationId: string,
  enabled: boolean,
  stamp: ResidentAssistantStamp,
  secret: string,
): StoredResidentAssistantSettings {
  const unsigned: Unsigned = { enabled: enabled === true, updated_at: stamp.updatedAt, updated_by: stamp.updatedBy }
  return { ...unsigned, sig: hmac(secret, payload(associationId, unsigned)) }
}

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function isStored(v: Record<string, unknown>): v is Record<string, unknown> & StoredResidentAssistantSettings {
  return (
    typeof v.enabled === 'boolean' &&
    typeof v.updated_at === 'string' &&
    (v.updated_by === null || typeof v.updated_by === 'string') &&
    typeof v.sig === 'string'
  )
}

export function readResidentAssistantSettings(
  associationId: string,
  complianceSettings: unknown,
  secret: string | null,
): ResidentAssistantReadResult {
  const raw = asObject(complianceSettings)?.[RESIDENT_ASSISTANT_KEY]
  if (raw === undefined || raw === null) return { state: 'not_configured' }
  const obj = asObject(raw)
  if (!obj || !isStored(obj) || !secret) return { state: 'unverified' }
  const expected = Buffer.from(hmac(secret, payload(associationId, obj)), 'hex')
  const actual = Buffer.from(obj.sig, 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { state: 'unverified' }
  return { state: 'configured', enabled: obj.enabled, updatedAt: obj.updated_at, updatedBy: obj.updated_by }
}

/** What the resident portal acts on. Default ON; a forged or unreadable value is OFF. */
export function residentAssistantOn(associationId: string, complianceSettings: unknown, secret: string | null): boolean {
  const read = readResidentAssistantSettings(associationId, complianceSettings, secret)
  if (read.state === 'not_configured') return true
  return read.state === 'configured' && read.enabled
}

/** compliance_settings with ours replaced; every other key kept. */
export function withResidentAssistantSettings(
  complianceSettings: unknown,
  stored: StoredResidentAssistantSettings,
): Record<string, unknown> {
  return { ...(asObject(complianceSettings) ?? {}), [RESIDENT_ASSISTANT_KEY]: stored }
}
