/**
 * BL-165: the conflict-of-interest disclosure record and what it means.
 * Pure and dependency-free (no `@/`), like lib/ga-registration/model.ts.
 *
 * One disclosure is one voting board member's answer for one decision:
 * "no conflict", or "conflict: recused", with a short note. A decision is a
 * bid award (decisionId = the bid's id) or a contract approval (decisionId
 * = the vendor the board is approving to work, from the approvals inbox).
 * Kept in associations.compliance_settings[CONFLICT_DISCLOSURES_KEY],
 * signed by ./store.ts. Audit rows never carry the note.
 */

import type { DisclosureMode } from './law'

export const CONFLICT_DISCLOSURES_KEY = 'conflict_disclosures'
export const CONFLICT_DISCLOSURE_AUDIT_ACTION = 'conflict_disclosure.recorded'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const DECISION_KINDS = ['bid_award', 'contract_approval'] as const
export type DecisionKind = (typeof DECISION_KINDS)[number]
export const DECISION_LABEL: Record<DecisionKind, string> = {
  bid_award: 'Bid award',
  contract_approval: 'Contract approval',
}

export const DISCLOSURE_STATUSES = ['no_conflict', 'conflict_recused'] as const
export type DisclosureStatus = (typeof DISCLOSURE_STATUSES)[number]
export const STATUS_LABEL: Record<DisclosureStatus, string> = {
  no_conflict: 'No conflict',
  conflict_recused: 'Conflict: recused',
}

export const NOTE_MAX = 280
/** Oldest entries fall off past this, so the record can't grow without bound. */
export const MAX_DISCLOSURES = 400

export interface Disclosure {
  decisionKind: DecisionKind
  decisionId: string
  memberId: string
  status: DisclosureStatus
  /** Free text, one paragraph, up to NOTE_MAX. Required for a conflict. Never audited. */
  note: string
  /** ISO instant. */
  recordedAt: string
  recordedBy: string | null
}

export interface ConflictDisclosureRecord {
  disclosures: Disclosure[]
}

export const EMPTY_CONFLICT_DISCLOSURES: ConflictDisclosureRecord = { disclosures: [] }

const isStr = (v: unknown): v is string => typeof v === 'string'

export function isDisclosure(v: unknown): v is Disclosure {
  if (typeof v !== 'object' || v === null) return false
  const d = v as Record<string, unknown>
  return (
    DECISION_KINDS.includes(d.decisionKind as DecisionKind) &&
    isStr(d.decisionId) &&
    UUID.test(d.decisionId) &&
    isStr(d.memberId) &&
    UUID.test(d.memberId) &&
    DISCLOSURE_STATUSES.includes(d.status as DisclosureStatus) &&
    isStr(d.note) &&
    d.note.length <= NOTE_MAX &&
    isStr(d.recordedAt) &&
    (d.recordedBy === null || isStr(d.recordedBy))
  )
}

export function isConflictDisclosureRecord(v: unknown): v is ConflictDisclosureRecord {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return Array.isArray(r.disclosures) && r.disclosures.length <= MAX_DISCLOSURES && r.disclosures.every(isDisclosure)
}

/** Key order fixed, so the signed bytes never depend on how the record was built. */
export function cleanConflictDisclosures(r: ConflictDisclosureRecord): ConflictDisclosureRecord {
  return {
    disclosures: r.disclosures.map((d) => ({
      decisionKind: d.decisionKind,
      decisionId: d.decisionId,
      memberId: d.memberId,
      status: d.status,
      note: d.note,
      recordedAt: d.recordedAt,
      recordedBy: d.recordedBy,
    })),
  }
}

/** One paragraph, trimmed, within NOTE_MAX; false when it is not text or too long. */
export function parseNote(raw: unknown): string | false {
  if (raw === undefined || raw === null) return ''
  if (!isStr(raw)) return false
  const s = raw.replace(/\s+/g, ' ').trim()
  return s.length <= NOTE_MAX ? s : false
}

/** The record with this member's answer for this decision (replacing an earlier one). */
export function withDisclosure(r: ConflictDisclosureRecord, d: Disclosure): ConflictDisclosureRecord {
  const rest = r.disclosures.filter(
    (x) => !(x.decisionKind === d.decisionKind && x.decisionId === d.decisionId && x.memberId === d.memberId),
  )
  return { disclosures: [...rest, d].slice(-MAX_DISCLOSURES) }
}

export function disclosuresFor(r: ConflictDisclosureRecord, kind: DecisionKind, decisionId: string): Disclosure[] {
  return r.disclosures.filter((d) => d.decisionKind === kind && d.decisionId === decisionId)
}

export interface DisclosureProgress {
  entries: Disclosure[]
  /** Required members who have not disclosed yet. */
  missing: string[]
  complete: boolean
}

export function disclosureProgress(
  r: ConflictDisclosureRecord,
  kind: DecisionKind,
  decisionId: string,
  requiredMemberIds: readonly string[],
): DisclosureProgress {
  const entries = disclosuresFor(r, kind, decisionId)
  const done = new Set(entries.map((e) => e.memberId))
  const missing = requiredMemberIds.filter((id) => !done.has(id))
  return { entries, missing, complete: missing.length === 0 }
}

/** The one rule that stops a decision: Georgia, from 2027-01-01, and someone hasn't disclosed. */
export function disclosureBlocks(mode: DisclosureMode, progress: DisclosureProgress): boolean {
  return mode === 'required' && !progress.complete
}

export const BLOCKED_MESSAGE =
  'Every board member has to record a conflict-of-interest disclosure before this can go ahead. Open the disclosure panel on this page.'

/** Who may record whose: a board member their own; an admin any board member's. */
export function mayRecordFor(role: 'admin' | 'board', actorId: string, memberId: string, boardIds: readonly string[]): boolean {
  if (!boardIds.includes(memberId)) return false
  return role === 'admin' || actorId === memberId
}

/** Plain lines for a decision record or a minutes draft. `names` maps member id to a display name. */
export function disclosureLines(entries: readonly Disclosure[], names: ReadonlyMap<string, string>): string[] {
  return entries.map((e) => {
    const who = names.get(e.memberId) ?? 'A board member'
    const base = `${who}: ${STATUS_LABEL[e.status].toLowerCase()}`
    return e.note ? `${base} (${e.note})` : base
  })
}
