/**
 * BL-122 quorum kit storage: sign, read and merge the kit kept in
 * associations.compliance_settings[QUORUM_KITS_KEY]. Server-only
 * (node:crypto). Why it is signed and what it stores: ./quorum.ts.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { EMPTY_KIT, MAX_KIT_HOMES, UUID, isIsoish, isProxyKind, isValidQuorumPct, type HomeEntry, type ProxyKind, type QuorumKit } from './quorum'

export const QUORUM_KITS_KEY = 'meeting_quorum_kits'
export const MAX_STORED_KITS = 6

const SIGNATURE_DOMAIN = 'meeting-quorum-kit:v1'

export interface KitStamp {
  updatedAt: string
  updatedBy: string | null
}

/** The JSON stored under compliance_settings.meeting_quorum_kits[meetingId]. */
export interface StoredKit {
  v: 1
  member_meeting: boolean
  quorum_pct: number | null
  /** [propertyId, proxyKind | null, proxyAt | null, presentAt | null], sorted by id. */
  homes: Array<[string, ProxyKind | null, string | null, string | null]>
  updated_at: string
  updated_by: string | null
  sig: string
}

export type KitReadResult =
  | ({ state: 'saved' } & QuorumKit & KitStamp)
  | ({ state: 'none' } & QuorumKit)
  /** Present but not written by the signed board save. Treated as empty. */
  | ({ state: 'unverified' } & QuorumKit)

// ─── Sign / read / merge ─────────────────────────────────────────────

type Unsigned = Omit<StoredKit, 'sig'>

function payload(associationId: string, meetingId: string, s: Unsigned): string {
  return JSON.stringify([SIGNATURE_DOMAIN, associationId, meetingId, s.v, s.member_meeting, s.quorum_pct, s.homes, s.updated_at, s.updated_by])
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

function toStoredHomes(homes: Record<string, HomeEntry>): StoredKit['homes'] {
  return Object.entries(homes)
    .filter(([, e]) => e.proxy !== null || e.presentAt !== null)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, e]) => [id, e.proxy?.kind ?? null, e.proxy?.at ?? null, e.presentAt])
}

export function signKit(associationId: string, meetingId: string, kit: QuorumKit, stamp: KitStamp, secret: string): StoredKit {
  if (kit.quorumPct !== null && !isValidQuorumPct(kit.quorumPct)) throw new RangeError('quorum percent out of range')
  const homes = toStoredHomes(kit.homes)
  if (homes.length > MAX_KIT_HOMES) throw new RangeError('too many homes')
  for (const [id, kind, at, presentAt] of homes) {
    if (!UUID.test(id)) throw new RangeError('home id is not a uuid')
    if ((kind === null) !== (at === null) || (kind !== null && !isProxyKind(kind))) throw new RangeError('bad proxy entry')
    if (at !== null && !isIsoish(at)) throw new RangeError('bad proxy time')
    if (presentAt !== null && !isIsoish(presentAt)) throw new RangeError('bad check-in time')
  }
  const unsigned: Unsigned = {
    v: 1,
    member_meeting: kit.memberMeeting,
    quorum_pct: kit.quorumPct,
    homes,
    updated_at: stamp.updatedAt,
    updated_by: stamp.updatedBy,
  }
  return { ...unsigned, sig: hmac(secret, payload(associationId, meetingId, unsigned)) }
}

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function isStoredHome(h: unknown): h is StoredKit['homes'][number] {
  if (!Array.isArray(h) || h.length !== 4) return false
  const [id, kind, at, presentAt] = h
  return (
    typeof id === 'string' &&
    (kind === null || isProxyKind(kind)) &&
    (at === null || typeof at === 'string') &&
    (kind === null) === (at === null) &&
    (presentAt === null || typeof presentAt === 'string')
  )
}

function isStored(v: Record<string, unknown>): v is Record<string, unknown> & StoredKit {
  return (
    v.v === 1 &&
    typeof v.member_meeting === 'boolean' &&
    (v.quorum_pct === null || isValidQuorumPct(v.quorum_pct)) &&
    Array.isArray(v.homes) &&
    v.homes.every(isStoredHome) &&
    typeof v.updated_at === 'string' &&
    (v.updated_by === null || typeof v.updated_by === 'string') &&
    typeof v.sig === 'string'
  )
}

/** All stored kits, as written (unverified). */
export function storedKits(complianceSettings: unknown): Record<string, unknown> {
  return asObject(asObject(complianceSettings)?.[QUORUM_KITS_KEY]) ?? {}
}

export function readKit(associationId: string, meetingId: string, complianceSettings: unknown, secret: string | null): KitReadResult {
  const raw = storedKits(complianceSettings)[meetingId]
  if (raw === undefined || raw === null) return { state: 'none', ...EMPTY_KIT, homes: {} }
  const obj = asObject(raw)
  if (!obj || !isStored(obj) || !secret) return { state: 'unverified', ...EMPTY_KIT, homes: {} }
  const expected = Buffer.from(hmac(secret, payload(associationId, meetingId, obj)), 'hex')
  const actual = Buffer.from(obj.sig, 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { state: 'unverified', ...EMPTY_KIT, homes: {} }
  }
  const homes: Record<string, HomeEntry> = {}
  for (const [id, kind, at, presentAt] of obj.homes) {
    homes[id] = { proxy: kind && at ? { kind, at } : null, presentAt }
  }
  return {
    state: 'saved',
    memberMeeting: obj.member_meeting,
    quorumPct: obj.quorum_pct,
    homes,
    updatedAt: obj.updated_at,
    updatedBy: obj.updated_by,
  }
}

/**
 * compliance_settings with this meeting's kit replaced and every other key
 * kept. Keeps at most MAX_STORED_KITS kits: the ones updated longest ago go
 * first (this one is always kept).
 */
export function withKit(complianceSettings: unknown, meetingId: string, stored: StoredKit): Record<string, unknown> {
  const base = asObject(complianceSettings) ?? {}
  const kits: Record<string, unknown> = { ...storedKits(complianceSettings), [meetingId]: stored }
  const updatedAt = (v: unknown) => {
    const t = asObject(v)?.updated_at
    return typeof t === 'string' ? t : ''
  }
  const others = Object.keys(kits)
    .filter((k) => k !== meetingId)
    .sort((a, b) => updatedAt(kits[b]).localeCompare(updatedAt(kits[a])))
  const keep = new Set([meetingId, ...others.slice(0, MAX_STORED_KITS - 1)])
  const pruned: Record<string, unknown> = {}
  for (const k of Object.keys(kits)) if (keep.has(k)) pruned[k] = kits[k]
  return { ...base, [QUORUM_KITS_KEY]: pruned }
}

