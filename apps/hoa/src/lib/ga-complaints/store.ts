/**
 * BL-161 storage: the Secretary of State complaints the board recorded, in
 * associations.compliance_settings[GA_COMPLAINTS_KEY], keyed by unit id.
 * No migration.
 *
 * Signed like the BL-149 registration record (and BL-122/141/147): any org
 * member can PATCH compliance_settings with their own session, so a record
 * is trusted only when it carries the HMAC the board's server action
 * wrote. Anything else reads as "unverified", which the state law check
 * and the late-fee job treat as a stay that can't be ruled out (fail
 * closed: nothing is collected on a record nobody can trust).
 *
 * Server-only (node:crypto). Dependency-free otherwise: packages/jobs
 * imports this file by relative path.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { gaRegistrationSecret } from '../ga-registration/store'
import {
  EMPTY_GA_COMPLAINTS,
  GA_COMPLAINTS_KEY,
  cleanGaComplaints,
  isGaComplaintsRecord,
  type GaComplaintsRecord,
} from './model'

const SIGNATURE_DOMAIN = 'ga-complaints:v1'

export interface StoredGaComplaints {
  v: 1
  record: GaComplaintsRecord
  updated_at: string
  updated_by: string | null
  sig: string
}

export type GaComplaintsRead =
  | { state: 'saved'; record: GaComplaintsRecord; updatedAt: string }
  | { state: 'none'; record: GaComplaintsRecord }
  | { state: 'unverified'; record: GaComplaintsRecord }

/** The same server-only secret chain as the registration record. */
export const gaComplaintsSecret = gaRegistrationSecret

function payload(associationId: string, r: GaComplaintsRecord, updatedAt: string, updatedBy: string | null): string {
  return JSON.stringify([SIGNATURE_DOMAIN, associationId, cleanGaComplaints(r), updatedAt, updatedBy])
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

export function signGaComplaints(
  associationId: string,
  record: GaComplaintsRecord,
  stamp: { updatedAt: string; updatedBy: string | null },
  secret: string,
): StoredGaComplaints {
  if (!isGaComplaintsRecord(record)) throw new RangeError('not a complaints record')
  const clean = cleanGaComplaints(record)
  return {
    v: 1,
    record: clean,
    updated_at: stamp.updatedAt,
    updated_by: stamp.updatedBy,
    sig: hmac(secret, payload(associationId, clean, stamp.updatedAt, stamp.updatedBy)),
  }
}

export function readGaComplaints(associationId: string, complianceSettings: unknown, secret: string | null): GaComplaintsRead {
  const raw = asObject(complianceSettings)?.[GA_COMPLAINTS_KEY]
  if (raw === undefined || raw === null) return { state: 'none', record: cleanGaComplaints(EMPTY_GA_COMPLAINTS) }
  const unverified = { state: 'unverified' as const, record: cleanGaComplaints(EMPTY_GA_COMPLAINTS) }
  const obj = asObject(raw)
  if (
    !obj ||
    !secret ||
    obj.v !== 1 ||
    !isGaComplaintsRecord(obj.record) ||
    typeof obj.updated_at !== 'string' ||
    !(obj.updated_by === null || typeof obj.updated_by === 'string') ||
    typeof obj.sig !== 'string'
  ) {
    return unverified
  }
  const expected = Buffer.from(hmac(secret, payload(associationId, obj.record, obj.updated_at, obj.updated_by as string | null)), 'hex')
  const actual = Buffer.from(obj.sig, 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return unverified
  return { state: 'saved', record: cleanGaComplaints(obj.record), updatedAt: obj.updated_at }
}

/** compliance_settings with the record replaced and every other key kept. */
export function withGaComplaints(complianceSettings: unknown, stored: StoredGaComplaints): Record<string, unknown> {
  return { ...(asObject(complianceSettings) ?? {}), [GA_COMPLAINTS_KEY]: stored }
}
