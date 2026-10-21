/**
 * BL-141 election storage: sign, read and merge the election kept in
 * associations.compliance_settings[ELECTIONS_KEY][meetingId]. Server-only
 * (node:crypto). What is stored, and why it is signed: ./model.ts.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  EMPTY_ELECTION,
  MAX_CANDIDATES,
  MAX_INSPECTORS,
  UUID,
  cleanName,
  isCalendarDay,
  isValidSeats,
  isValidVotes,
  type Candidate,
  type Election,
} from './model'

export const ELECTIONS_KEY = 'meeting_elections'
export const MAX_STORED_ELECTIONS = 4

const SIGNATURE_DOMAIN = 'meeting-election:v1'

export interface ElectionStamp {
  updatedAt: string
  updatedBy: string | null
}

type StoredCandidate = [id: string, name: string, propertyId: string | null, nominatedOn: string | null, onBallot: boolean, votes: number | null]

/** The JSON stored under compliance_settings.meeting_elections[meetingId]. */
export interface StoredElection {
  v: 1
  seats: number | null
  nomination_deadline: string | null
  ballots_out_on: string | null
  inspectors: string[]
  candidates: StoredCandidate[]
  results_announced_on: string | null
  quorum_reached: boolean | null
  reconvened_on: string | null
  updated_at: string
  updated_by: string | null
  sig: string
}

export type ElectionReadResult =
  | ({ state: 'saved' } & Election & ElectionStamp)
  | ({ state: 'none' } & Election)
  /** Present but not written by the signed board save. Treated as empty. */
  | ({ state: 'unverified' } & Election)

type Unsigned = Omit<StoredElection, 'sig'>

function payload(associationId: string, meetingId: string, s: Unsigned): string {
  return JSON.stringify([
    SIGNATURE_DOMAIN,
    associationId,
    meetingId,
    s.v,
    s.seats,
    s.nomination_deadline,
    s.ballots_out_on,
    s.inspectors,
    s.candidates,
    s.results_announced_on,
    s.quorum_reached,
    s.reconvened_on,
    s.updated_at,
    s.updated_by,
  ])
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

const dayOrNull = (v: unknown): v is string | null => v === null || isCalendarDay(v)

function isStoredCandidate(c: unknown): c is StoredCandidate {
  if (!Array.isArray(c) || c.length !== 6) return false
  const [id, name, propertyId, nominatedOn, onBallot, votes] = c
  return (
    typeof id === 'string' &&
    UUID.test(id) &&
    typeof name === 'string' &&
    cleanName(name) === name &&
    (propertyId === null || (typeof propertyId === 'string' && UUID.test(propertyId))) &&
    dayOrNull(nominatedOn) &&
    typeof onBallot === 'boolean' &&
    (votes === null || isValidVotes(votes))
  )
}

function isStored(v: Record<string, unknown>): v is Record<string, unknown> & StoredElection {
  return (
    v.v === 1 &&
    (v.seats === null || isValidSeats(v.seats)) &&
    dayOrNull(v.nomination_deadline) &&
    dayOrNull(v.ballots_out_on) &&
    Array.isArray(v.inspectors) &&
    v.inspectors.length <= MAX_INSPECTORS &&
    v.inspectors.every((n) => typeof n === 'string' && cleanName(n) === n) &&
    Array.isArray(v.candidates) &&
    v.candidates.length <= MAX_CANDIDATES &&
    v.candidates.every(isStoredCandidate) &&
    dayOrNull(v.results_announced_on) &&
    (v.quorum_reached === null || typeof v.quorum_reached === 'boolean') &&
    dayOrNull(v.reconvened_on) &&
    typeof v.updated_at === 'string' &&
    (v.updated_by === null || typeof v.updated_by === 'string') &&
    typeof v.sig === 'string'
  )
}

export function signElection(associationId: string, meetingId: string, e: Election, stamp: ElectionStamp, secret: string): StoredElection {
  if (e.seats !== null && !isValidSeats(e.seats)) throw new RangeError('seats out of range')
  if (e.candidates.length > MAX_CANDIDATES) throw new RangeError('too many candidates')
  if (e.inspectors.length > MAX_INSPECTORS) throw new RangeError('too many inspectors')
  const unsigned: Unsigned = {
    v: 1,
    seats: e.seats,
    nomination_deadline: e.nominationDeadline,
    ballots_out_on: e.ballotsOutOn,
    inspectors: [...e.inspectors],
    candidates: e.candidates.map((c): StoredCandidate => [c.id, c.name, c.propertyId, c.nominatedOn, c.onBallot, c.votes]),
    results_announced_on: e.resultsAnnouncedOn,
    quorum_reached: e.quorumReached,
    reconvened_on: e.reconvenedOn,
    updated_at: stamp.updatedAt,
    updated_by: stamp.updatedBy,
  }
  // Refuse to write anything a read would reject.
  if (!isStored({ ...unsigned, sig: '' })) throw new RangeError('election does not validate')
  return { ...unsigned, sig: hmac(secret, payload(associationId, meetingId, unsigned)) }
}

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** All stored elections, as written (unverified). */
export function storedElections(complianceSettings: unknown): Record<string, unknown> {
  return asObject(asObject(complianceSettings)?.[ELECTIONS_KEY]) ?? {}
}

const empty = (): Election => ({ ...EMPTY_ELECTION, inspectors: [], candidates: [] })

export function readElection(associationId: string, meetingId: string, complianceSettings: unknown, secret: string | null): ElectionReadResult {
  const raw = storedElections(complianceSettings)[meetingId]
  if (raw === undefined || raw === null) return { state: 'none', ...empty() }
  const obj = asObject(raw)
  if (!obj || !isStored(obj) || !secret) return { state: 'unverified', ...empty() }
  const expected = Buffer.from(hmac(secret, payload(associationId, meetingId, obj)), 'hex')
  const actual = Buffer.from(obj.sig, 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { state: 'unverified', ...empty() }
  }
  return {
    state: 'saved',
    seats: obj.seats,
    nominationDeadline: obj.nomination_deadline,
    ballotsOutOn: obj.ballots_out_on,
    inspectors: [...obj.inspectors],
    candidates: obj.candidates.map(
      ([id, name, propertyId, nominatedOn, onBallot, votes]): Candidate => ({ id, name, propertyId, nominatedOn, onBallot, votes }),
    ),
    resultsAnnouncedOn: obj.results_announced_on,
    quorumReached: obj.quorum_reached,
    reconvenedOn: obj.reconvened_on,
    updatedAt: obj.updated_at,
    updatedBy: obj.updated_by,
  }
}

/** The election part of a read, without the read state and stamp. */
export function electionOf(r: ElectionReadResult): Election {
  return {
    seats: r.seats,
    nominationDeadline: r.nominationDeadline,
    ballotsOutOn: r.ballotsOutOn,
    inspectors: r.inspectors,
    candidates: r.candidates,
    resultsAnnouncedOn: r.resultsAnnouncedOn,
    quorumReached: r.quorumReached,
    reconvenedOn: r.reconvenedOn,
  }
}

/**
 * compliance_settings with this meeting's election replaced and every other
 * key kept. Keeps at most MAX_STORED_ELECTIONS: the ones updated longest
 * ago go first (this one is always kept).
 */
export function withElection(complianceSettings: unknown, meetingId: string, stored: StoredElection): Record<string, unknown> {
  const base = asObject(complianceSettings) ?? {}
  const all: Record<string, unknown> = { ...storedElections(complianceSettings), [meetingId]: stored }
  const updatedAt = (v: unknown) => {
    const t = asObject(v)?.updated_at
    return typeof t === 'string' ? t : ''
  }
  const others = Object.keys(all)
    .filter((k) => k !== meetingId)
    .sort((a, b) => updatedAt(all[b]).localeCompare(updatedAt(all[a])))
  const keep = new Set([meetingId, ...others.slice(0, MAX_STORED_ELECTIONS - 1)])
  const pruned: Record<string, unknown> = {}
  for (const k of Object.keys(all)) if (keep.has(k)) pruned[k] = all[k]
  return { ...base, [ELECTIONS_KEY]: pruned }
}
