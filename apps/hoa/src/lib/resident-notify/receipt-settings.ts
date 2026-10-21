/**
 * BL-114 — the association's "Email owners a receipt when we record their
 * payment" setting.
 *
 * STORAGE. No migration: the value lives in
 * associations.compliance_settings[PAYMENT_RECEIPTS_KEY], next to
 * resident_notifications, pay_by_zelle and dues_reminders. Every write keeps
 * the other keys.
 *
 * WHY SIGNED. Same reason as settings.ts (BL-082): until migration 0063 is
 * applied in production, any org member can PATCH compliance_settings with
 * their own session. Only a value whose HMAC verifies with the server-only
 * secret (paySettingsSecret) is honoured; anything else reads as OFF.
 *
 * DEFAULT OFF (owner rule). No automatic email reaches a resident until a
 * board turns this on. A missing, unverified or unreadable value is OFF.
 * The board's explicit per-payment "Send receipt" click does not read this
 * setting at all.
 *
 * Pure (node:crypto only). Server-only — never import from a client
 * component.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export const PAYMENT_RECEIPTS_KEY = 'payment_receipts'

const SIGNATURE_DOMAIN = 'payment-receipts:v1'

export interface PaymentReceiptSettings {
  /** Email the unit's owners a receipt when the board records a payment. */
  emailOnRecord: boolean
}

export interface PaymentReceiptStamp {
  updatedAt: string
  updatedBy: string | null
}

/** The JSON stored under compliance_settings.payment_receipts. */
export interface StoredPaymentReceiptSettings {
  email_on_record: boolean
  updated_at: string
  updated_by: string | null
  sig: string
}

export type PaymentReceiptReadResult =
  | ({ state: 'configured'; settings: PaymentReceiptSettings } & PaymentReceiptStamp)
  | { state: 'not_configured' }
  /** Present but not written by the signed board save. Reads as OFF. */
  | { state: 'unverified' }

type Unsigned = Omit<StoredPaymentReceiptSettings, 'sig'>

function payload(associationId: string, s: Unsigned): string {
  return JSON.stringify([SIGNATURE_DOMAIN, associationId, s.email_on_record, s.updated_at, s.updated_by])
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

export function signPaymentReceiptSettings(
  associationId: string,
  value: PaymentReceiptSettings,
  stamp: PaymentReceiptStamp,
  secret: string,
): StoredPaymentReceiptSettings {
  const unsigned: Unsigned = {
    email_on_record: value.emailOnRecord === true,
    updated_at: stamp.updatedAt,
    updated_by: stamp.updatedBy,
  }
  return { ...unsigned, sig: hmac(secret, payload(associationId, unsigned)) }
}

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function isStored(v: Record<string, unknown>): v is Record<string, unknown> & StoredPaymentReceiptSettings {
  return (
    typeof v.email_on_record === 'boolean' &&
    typeof v.updated_at === 'string' &&
    (v.updated_by === null || typeof v.updated_by === 'string') &&
    typeof v.sig === 'string'
  )
}

export function readPaymentReceiptSettings(
  associationId: string,
  complianceSettings: unknown,
  secret: string | null,
): PaymentReceiptReadResult {
  const raw = asObject(complianceSettings)?.[PAYMENT_RECEIPTS_KEY]
  if (raw === undefined || raw === null) return { state: 'not_configured' }
  const obj = asObject(raw)
  if (!obj || !isStored(obj) || !secret) return { state: 'unverified' }

  const expected = Buffer.from(hmac(secret, payload(associationId, obj)), 'hex')
  const actual = Buffer.from(obj.sig, 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { state: 'unverified' }
  return {
    state: 'configured',
    settings: { emailOnRecord: obj.email_on_record },
    updatedAt: obj.updated_at,
    updatedBy: obj.updated_by,
  }
}

/** What the automatic send acts on: true only for a verified, saved ON. */
export function paymentReceiptsOn(associationId: string, complianceSettings: unknown, secret: string | null): boolean {
  const read = readPaymentReceiptSettings(associationId, complianceSettings, secret)
  return read.state === 'configured' && read.settings.emailOnRecord
}

/** compliance_settings with ours replaced; every other key kept. */
export function withPaymentReceiptSettings(
  complianceSettings: unknown,
  stored: StoredPaymentReceiptSettings,
): Record<string, unknown> {
  return { ...(asObject(complianceSettings) ?? {}), [PAYMENT_RECEIPTS_KEY]: stored }
}
