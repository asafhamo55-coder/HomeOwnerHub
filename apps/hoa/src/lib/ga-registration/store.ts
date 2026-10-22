/**
 * BL-149 storage: the Georgia registration record in
 * associations.compliance_settings[GA_REGISTRATION_KEY]. No migration.
 *
 * Signed for the same reason as the BL-122 quorum kit, the BL-141 election
 * planner and the BL-147 late-fee policy: any org member can PATCH
 * compliance_settings with their own session, so a record is trusted only
 * when it carries the HMAC the board's server action wrote. Anything else
 * reads as "unverified", which the state law check and the late-fee job
 * treat as NOT registered (fail closed: a forged "registered" can't unlock
 * fines or fees).
 *
 * Server-only (node:crypto). Dependency-free otherwise: packages/jobs
 * imports this file by relative path.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  EMPTY_GA_REGISTRATION,
  GA_REGISTRATION_KEY,
  cleanGaRegistration,
  gaRegistrationStanding,
  isGaRegistrationRecord,
  type GaRegistrationRecord,
  type GaRegistrationStanding,
} from './model'

const SIGNATURE_DOMAIN = 'ga-registration:v1'

export interface StoredGaRegistration {
  v: 1
  record: GaRegistrationRecord
  updated_at: string
  updated_by: string | null
  sig: string
}

export type GaRegistrationRead =
  | { state: 'saved'; record: GaRegistrationRecord; updatedAt: string }
  | { state: 'none'; record: GaRegistrationRecord }
  | { state: 'unverified'; record: GaRegistrationRecord }

/** Same server-only chain as paySettingsSecret(); repeated because packages/jobs imports this file. */
export function gaRegistrationSecret(env: Record<string, string | undefined> = process.env): string | null {
  return env.PAY_SETTINGS_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || null
}

function payload(associationId: string, r: GaRegistrationRecord, updatedAt: string, updatedBy: string | null): string {
  return JSON.stringify([SIGNATURE_DOMAIN, associationId, cleanGaRegistration(r), updatedAt, updatedBy])
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

export function signGaRegistration(
  associationId: string,
  record: GaRegistrationRecord,
  stamp: { updatedAt: string; updatedBy: string | null },
  secret: string,
): StoredGaRegistration {
  if (!isGaRegistrationRecord(record)) throw new RangeError('not a registration record')
  const clean = cleanGaRegistration(record)
  return {
    v: 1,
    record: clean,
    updated_at: stamp.updatedAt,
    updated_by: stamp.updatedBy,
    sig: hmac(secret, payload(associationId, clean, stamp.updatedAt, stamp.updatedBy)),
  }
}

export function readGaRegistration(associationId: string, complianceSettings: unknown, secret: string | null): GaRegistrationRead {
  const raw = asObject(complianceSettings)?.[GA_REGISTRATION_KEY]
  if (raw === undefined || raw === null) return { state: 'none', record: cleanGaRegistration(EMPTY_GA_REGISTRATION) }
  const unverified = { state: 'unverified' as const, record: cleanGaRegistration(EMPTY_GA_REGISTRATION) }
  const obj = asObject(raw)
  if (
    !obj ||
    !secret ||
    obj.v !== 1 ||
    !isGaRegistrationRecord(obj.record) ||
    typeof obj.updated_at !== 'string' ||
    !(obj.updated_by === null || typeof obj.updated_by === 'string') ||
    typeof obj.sig !== 'string'
  ) {
    return unverified
  }
  const expected = Buffer.from(hmac(secret, payload(associationId, obj.record, obj.updated_at, obj.updated_by as string | null)), 'hex')
  const actual = Buffer.from(obj.sig, 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return unverified
  return { state: 'saved', record: cleanGaRegistration(obj.record), updatedAt: obj.updated_at }
}

/** compliance_settings with the record replaced and every other key kept. */
export function withGaRegistration(complianceSettings: unknown, stored: StoredGaRegistration): Record<string, unknown> {
  return { ...(asObject(complianceSettings) ?? {}), [GA_REGISTRATION_KEY]: stored }
}

/** Read and judge in one step: what the gate, the job and /compliance use. */
export function gaStandingOf(
  associationId: string,
  complianceSettings: unknown,
  secret: string | null,
  today: string,
): GaRegistrationStanding {
  return gaRegistrationStanding(readGaRegistration(associationId, complianceSettings, secret), today)
}
