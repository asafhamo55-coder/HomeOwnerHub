/**
 * BL-138 storage: the adoption record for a budget, kept in
 * associations.compliance_settings[BUDGET_ADOPTIONS_KEY][budgetId].
 * Server-only (node:crypto).
 *
 * Signed for the same reason as the BL-122 quorum kit
 * (lib/meeting-quorum/quorum.ts): any org member can PATCH
 * compliance_settings with their own session, so a record is trusted only
 * when it carries the HMAC the board's server action wrote. Anything else
 * reads as empty ("unverified"). It holds ids, dates and a flag — no names.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { EMPTY_RECORD, type AdoptionRecord } from './model'

export const BUDGET_ADOPTIONS_KEY = 'budget_adoptions'
export const MAX_STORED_ADOPTIONS = 6

const SIGNATURE_DOMAIN = 'budget-adoption:v1'
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const DAY = /^\d{4}-\d{2}-\d{2}$/

export interface StoredAdoption {
  v: 1
  meeting_id: string | null
  special: boolean
  adopted_on: string | null
  owner_notice_on: string | null
  updated_at: string
  updated_by: string | null
  sig: string
}

export type AdoptionReadResult =
  | { state: 'saved'; record: AdoptionRecord; updatedAt: string }
  | { state: 'none'; record: AdoptionRecord }
  | { state: 'unverified'; record: AdoptionRecord }

type Unsigned = Omit<StoredAdoption, 'sig'>

function payload(associationId: string, budgetId: string, s: Unsigned): string {
  return JSON.stringify([
    SIGNATURE_DOMAIN,
    associationId,
    budgetId,
    s.v,
    s.meeting_id,
    s.special,
    s.adopted_on,
    s.owner_notice_on,
    s.updated_at,
    s.updated_by,
  ])
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

export function isValidDay(v: unknown): v is string {
  if (typeof v !== 'string' || !DAY.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const t = new Date(Date.UTC(y!, m! - 1, d!))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m! - 1 && t.getUTCDate() === d
}

export function signAdoption(
  associationId: string,
  budgetId: string,
  record: AdoptionRecord,
  stamp: { updatedAt: string; updatedBy: string | null },
  secret: string,
): StoredAdoption {
  if (record.meetingId !== null && !UUID.test(record.meetingId)) throw new RangeError('meeting id is not a uuid')
  if (record.adoptedOn !== null && !isValidDay(record.adoptedOn)) throw new RangeError('bad adoption date')
  if (record.ownerNoticeOn !== null && !isValidDay(record.ownerNoticeOn)) throw new RangeError('bad owner notice date')
  const unsigned: Unsigned = {
    v: 1,
    meeting_id: record.meetingId,
    special: record.special,
    adopted_on: record.adoptedOn,
    owner_notice_on: record.ownerNoticeOn,
    updated_at: stamp.updatedAt,
    updated_by: stamp.updatedBy,
  }
  return { ...unsigned, sig: hmac(secret, payload(associationId, budgetId, unsigned)) }
}

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

const nullableString = (v: unknown) => v === null || typeof v === 'string'

function isStored(v: Record<string, unknown>): v is Record<string, unknown> & StoredAdoption {
  return (
    v.v === 1 &&
    nullableString(v.meeting_id) &&
    typeof v.special === 'boolean' &&
    nullableString(v.adopted_on) &&
    nullableString(v.owner_notice_on) &&
    typeof v.updated_at === 'string' &&
    nullableString(v.updated_by) &&
    typeof v.sig === 'string'
  )
}

/** All stored records, as written (unverified). */
export function storedAdoptions(complianceSettings: unknown): Record<string, unknown> {
  return asObject(asObject(complianceSettings)?.[BUDGET_ADOPTIONS_KEY]) ?? {}
}

export function readAdoption(
  associationId: string,
  budgetId: string,
  complianceSettings: unknown,
  secret: string | null,
): AdoptionReadResult {
  const raw = storedAdoptions(complianceSettings)[budgetId]
  if (raw === undefined || raw === null) return { state: 'none', record: { ...EMPTY_RECORD } }
  const obj = asObject(raw)
  if (!obj || !isStored(obj) || !secret) return { state: 'unverified', record: { ...EMPTY_RECORD } }
  const expected = Buffer.from(hmac(secret, payload(associationId, budgetId, obj)), 'hex')
  const actual = Buffer.from(obj.sig, 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { state: 'unverified', record: { ...EMPTY_RECORD } }
  }
  return {
    state: 'saved',
    record: {
      meetingId: obj.meeting_id,
      special: obj.special,
      adoptedOn: obj.adopted_on,
      ownerNoticeOn: obj.owner_notice_on,
    },
    updatedAt: obj.updated_at,
  }
}

/**
 * compliance_settings with this budget's record replaced and every other
 * key kept. Keeps at most MAX_STORED_ADOPTIONS records: the ones updated
 * longest ago go first (this one is always kept).
 */
export function withAdoption(complianceSettings: unknown, budgetId: string, stored: StoredAdoption): Record<string, unknown> {
  const base = asObject(complianceSettings) ?? {}
  const all: Record<string, unknown> = { ...storedAdoptions(complianceSettings), [budgetId]: stored }
  const updatedAt = (v: unknown) => {
    const t = asObject(v)?.updated_at
    return typeof t === 'string' ? t : ''
  }
  const others = Object.keys(all)
    .filter((k) => k !== budgetId)
    .sort((a, b) => updatedAt(all[b]).localeCompare(updatedAt(all[a])))
  const keep = new Set([budgetId, ...others.slice(0, MAX_STORED_ADOPTIONS - 1)])
  const pruned: Record<string, unknown> = {}
  for (const k of Object.keys(all)) if (keep.has(k)) pruned[k] = all[k]
  return { ...base, [BUDGET_ADOPTIONS_KEY]: pruned }
}
