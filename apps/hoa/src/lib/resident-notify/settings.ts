/**
 * BL-082 — the association's "Notify residents of decisions and replies"
 * setting.
 *
 * STORAGE. No migration: the value lives in
 * associations.compliance_settings[RESIDENT_NOTIFY_KEY], next to
 * pay_by_zelle, dues_reminders and vendor_insurance. Every write keeps the
 * other keys.
 *
 * WHY SIGNED. Same reason as those: until migration 0063 is applied in
 * production, any org member can PATCH compliance_settings with their own
 * session. Unsigned, a resident could switch on emails to every other
 * resident. Only a value whose HMAC verifies with the server-only secret
 * (paySettingsSecret) is honoured; anything else reads as OFF.
 *
 * DEFAULT OFF. Nothing new reaches a real resident until a board turns this
 * on. A missing, unverified or unreadable value is OFF.
 *
 * Pure (node:crypto only). Server-only — never import from a client
 * component.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export const RESIDENT_NOTIFY_KEY = 'resident_notifications'

const SIGNATURE_DOMAIN = 'resident-notifications:v1'

export interface ResidentNotifySettings {
  /** Email (and text, where opted in) the resident when the board decides
   *  their ARC application or replies to their ticket. */
  decisionsAndReplies: boolean
}

export interface ResidentNotifyStamp {
  updatedAt: string
  updatedBy: string | null
}

/** The JSON stored under compliance_settings.resident_notifications. */
export interface StoredResidentNotifySettings {
  decisions_and_replies: boolean
  updated_at: string
  updated_by: string | null
  sig: string
}

export type ResidentNotifyReadResult =
  | ({ state: 'configured'; settings: ResidentNotifySettings } & ResidentNotifyStamp)
  | { state: 'not_configured' }
  /** Present but not written by the signed board save. Reads as OFF. */
  | { state: 'unverified' }

export const DEFAULT_RESIDENT_NOTIFY_SETTINGS: ResidentNotifySettings = { decisionsAndReplies: false }

type Unsigned = Omit<StoredResidentNotifySettings, 'sig'>

function payload(associationId: string, s: Unsigned): string {
  return JSON.stringify([SIGNATURE_DOMAIN, associationId, s.decisions_and_replies, s.updated_at, s.updated_by])
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

export function signResidentNotifySettings(
  associationId: string,
  value: ResidentNotifySettings,
  stamp: ResidentNotifyStamp,
  secret: string,
): StoredResidentNotifySettings {
  const unsigned: Unsigned = {
    decisions_and_replies: value.decisionsAndReplies === true,
    updated_at: stamp.updatedAt,
    updated_by: stamp.updatedBy,
  }
  return { ...unsigned, sig: hmac(secret, payload(associationId, unsigned)) }
}

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function isStored(v: Record<string, unknown>): v is Record<string, unknown> & StoredResidentNotifySettings {
  return (
    typeof v.decisions_and_replies === 'boolean' &&
    typeof v.updated_at === 'string' &&
    (v.updated_by === null || typeof v.updated_by === 'string') &&
    typeof v.sig === 'string'
  )
}

export function readResidentNotifySettings(
  associationId: string,
  complianceSettings: unknown,
  secret: string | null,
): ResidentNotifyReadResult {
  const raw = asObject(complianceSettings)?.[RESIDENT_NOTIFY_KEY]
  if (raw === undefined || raw === null) return { state: 'not_configured' }
  const obj = asObject(raw)
  if (!obj || !isStored(obj) || !secret) return { state: 'unverified' }

  const expected = Buffer.from(hmac(secret, payload(associationId, obj)), 'hex')
  const actual = Buffer.from(obj.sig, 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { state: 'unverified' }
  return {
    state: 'configured',
    settings: { decisionsAndReplies: obj.decisions_and_replies },
    updatedAt: obj.updated_at,
    updatedBy: obj.updated_by,
  }
}

/** What the send path acts on: true only for a verified, saved ON. */
export function residentNotificationsOn(associationId: string, complianceSettings: unknown, secret: string | null): boolean {
  const read = readResidentNotifySettings(associationId, complianceSettings, secret)
  return read.state === 'configured' && read.settings.decisionsAndReplies
}

/** compliance_settings with ours replaced; every other key kept. */
export function withResidentNotifySettings(
  complianceSettings: unknown,
  stored: StoredResidentNotifySettings,
): Record<string, unknown> {
  return { ...(asObject(complianceSettings) ?? {}), [RESIDENT_NOTIFY_KEY]: stored }
}
