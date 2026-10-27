/**
 * BL-165 storage: the signed disclosure record in
 * associations.compliance_settings[CONFLICT_DISCLOSURES_KEY]. No migration.
 * Same reasoning and shape as lib/ga-registration/store.ts: any org member
 * can PATCH compliance_settings, so a record counts only when it carries
 * the HMAC a board server action wrote. Anything else reads "unverified",
 * which the gate treats as no disclosures (fail closed).
 *
 * Server-only (node:crypto).
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  CONFLICT_DISCLOSURES_KEY,
  EMPTY_CONFLICT_DISCLOSURES,
  cleanConflictDisclosures,
  isConflictDisclosureRecord,
  type ConflictDisclosureRecord,
} from './model'

const SIGNATURE_DOMAIN = 'conflict-disclosures:v1'

export interface StoredConflictDisclosures {
  v: 1
  record: ConflictDisclosureRecord
  updated_at: string
  updated_by: string | null
  sig: string
}

export type ConflictDisclosuresRead =
  | { state: 'saved'; record: ConflictDisclosureRecord }
  | { state: 'none'; record: ConflictDisclosureRecord }
  | { state: 'unverified'; record: ConflictDisclosureRecord }

function payload(associationId: string, r: ConflictDisclosureRecord, updatedAt: string, updatedBy: string | null): string {
  return JSON.stringify([SIGNATURE_DOMAIN, associationId, cleanConflictDisclosures(r), updatedAt, updatedBy])
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

export function signConflictDisclosures(
  associationId: string,
  record: ConflictDisclosureRecord,
  stamp: { updatedAt: string; updatedBy: string | null },
  secret: string,
): StoredConflictDisclosures {
  if (!isConflictDisclosureRecord(record)) throw new RangeError('not a disclosure record')
  const clean = cleanConflictDisclosures(record)
  return {
    v: 1,
    record: clean,
    updated_at: stamp.updatedAt,
    updated_by: stamp.updatedBy,
    sig: hmac(secret, payload(associationId, clean, stamp.updatedAt, stamp.updatedBy)),
  }
}

export function readConflictDisclosures(associationId: string, complianceSettings: unknown, secret: string | null): ConflictDisclosuresRead {
  const raw = asObject(complianceSettings)?.[CONFLICT_DISCLOSURES_KEY]
  const empty = cleanConflictDisclosures(EMPTY_CONFLICT_DISCLOSURES)
  if (raw === undefined || raw === null) return { state: 'none', record: empty }
  const obj = asObject(raw)
  if (
    !obj ||
    !secret ||
    obj.v !== 1 ||
    !isConflictDisclosureRecord(obj.record) ||
    typeof obj.updated_at !== 'string' ||
    !(obj.updated_by === null || typeof obj.updated_by === 'string') ||
    typeof obj.sig !== 'string'
  ) {
    return { state: 'unverified', record: empty }
  }
  const expected = Buffer.from(hmac(secret, payload(associationId, obj.record, obj.updated_at, obj.updated_by as string | null)), 'hex')
  const actual = Buffer.from(obj.sig, 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { state: 'unverified', record: empty }
  return { state: 'saved', record: cleanConflictDisclosures(obj.record) }
}

/** compliance_settings with the record replaced and every other key kept. */
export function withConflictDisclosures(complianceSettings: unknown, stored: StoredConflictDisclosures): Record<string, unknown> {
  return { ...(asObject(complianceSettings) ?? {}), [CONFLICT_DISCLOSURES_KEY]: stored }
}
