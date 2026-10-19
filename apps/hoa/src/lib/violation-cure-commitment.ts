// BL-054 follow-up — the owner's financial commitment to cure (California
// Civ. Code § 5855(c)(2)), recorded by the board on a violation.
//
// Where it lives (no migration): hoa_violations has no JSON column, so the
// fact is an append-only audit_log row on the violation —
// entity_type 'hoa_violation', entity_id = the violation id, and the
// newest of the two actions below wins. That is how this app already keeps
// a per-record fact without a column (recurring entries' paused/stopped
// state, lib/recurring-entries.ts). audit_log is board/admin-only by RLS
// (0063) and written as yourself, so the board's own client reads and
// writes it.
//
// What it does: W3's state rules (state-rules.ts) refuse a fine or a
// suspension for a CA association when `financialCommitmentToCure` is set.
// This module turns the recorded fact into that flag, for the status editor
// (blocks moving a violation to Fined) and the W3 draft route (letters).
// The refusal text comes from state-rules.ts, so the page and the letter
// cannot disagree about the law. Other states never see the control and
// the flag is never recorded for them.
//
// Pure apart from the injected client: no Next, unit-testable with a fake.

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import {
  RequestedActionSchema,
  evaluateRequestedAction,
  selectStateRules,
  type RequestedAction,
  type StateRuleSet,
} from '@homeowner-portal/workflows/W3-state-rules'

export type CommitmentDb = SupabaseClient<Database>

export const CURE_COMMITMENT_ENTITY = 'hoa_violation'
export const CURE_COMMITMENT_AUDIT = {
  recorded: 'violation.cure_commitment.recorded',
  withdrawn: 'violation.cure_commitment.withdrawn',
} as const
const ACTIONS = [CURE_COMMITMENT_AUDIT.recorded, CURE_COMMITMENT_AUDIT.withdrawn] as const

export const CURE_COMMITMENT_NOTE_MAX = 1000

export interface CureCommitment {
  /** The day the owner gave the commitment (YYYY-MM-DD). */
  committedOn: string
  note: string | null
  /** When the board recorded it (ISO timestamp). */
  recordedAt: string
}

/** Only California encodes § 5855(c)(2); everyone else never sees it. */
export function cureCommitmentApplies(rules: Pick<StateRuleSet, 'jurisdiction'>): boolean {
  return rules.jurisdiction === 'CA'
}

const isoDay = /^\d{4}-\d{2}-\d{2}$/

/** Today plus one day, as YYYY-MM-DD: a date the board typed in their own
 *  time zone may be a day ahead of UTC. */
function latestAllowedDay(now: Date): string {
  return new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10)
}

export function cureCommitmentInputSchema(now: Date = new Date()) {
  return z.object({
    violationId: z.string().uuid(),
    committedOn: z
      .string({ required_error: 'Enter the date the owner gave the commitment.' })
      .regex(isoDay, 'Enter the date the owner gave the commitment.')
      .refine((d) => !Number.isNaN(new Date(`${d}T00:00:00Z`).getTime()), 'Enter a real date.')
      .refine((d) => d <= latestAllowedDay(now), 'The date can’t be in the future.'),
    note: z
      .string()
      .trim()
      .max(CURE_COMMITMENT_NOTE_MAX, `Keep the note under ${CURE_COMMITMENT_NOTE_MAX.toLocaleString('en-US')} characters.`)
      .nullable()
      .optional()
      .transform((v) => (v ? v : null)),
  })
}

interface AuditRow {
  action: string
  created_at: string | null
  metadata: unknown
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** The commitment in force: the newest row, if it is a `recorded` one. */
export function latestCureCommitment(rows: readonly AuditRow[]): CureCommitment | null {
  let newest: AuditRow | null = null
  for (const r of rows) {
    if (!(ACTIONS as readonly string[]).includes(r.action)) continue
    if (!newest || (r.created_at ?? '') > (newest.created_at ?? '')) newest = r
  }
  if (!newest || newest.action !== CURE_COMMITMENT_AUDIT.recorded) return null
  const m = obj(newest.metadata)
  const committedOn = typeof m.committedOn === 'string' && isoDay.test(m.committedOn) ? m.committedOn : null
  if (!committedOn) return null
  return {
    committedOn,
    note: typeof m.note === 'string' && m.note.trim() ? m.note : null,
    recordedAt: newest.created_at ?? '',
  }
}

/** The W3 requested action with the recorded commitment folded in. The
 *  record wins over whatever the caller sent: a client cannot drop it. */
export function withCureCommitment<T extends RequestedAction>(
  action: T | undefined,
  commitment: CureCommitment | null,
): T | z.output<typeof RequestedActionSchema> | undefined {
  if (!commitment) return action
  return RequestedActionSchema.parse({ ...(action ?? {}), financialCommitmentToCure: true })
}

/**
 * Why a fine or suspension is blocked, in the words of state-rules.ts, or
 * null when nothing blocks it. Asks the rules about a penalty with the
 * hearing treated as held, so the only refusal left is the one the
 * commitment causes.
 */
export function cureCommitmentPenaltyBlock(
  rules: StateRuleSet,
  commitment: CureCommitment | null,
  step: 'impose_fine' | 'impose_suspension' = 'impose_fine',
): string | null {
  if (!commitment || !cureCommitmentApplies(rules)) return null
  const { refusals } = evaluateRequestedAction(rules, { step, hearingHeld: true, financialCommitmentToCure: true })
  return refusals.find((r) => r.includes('5855(c)(2)')) ?? null
}

// ─── Reads (the caller's RLS client) ────────────────────────────────

function fail(stage: string, code: string | undefined): never {
  // Codes only — never the note, an address or an owner's name.
  console.error('violation cure commitment read failed', { stage, code: code ?? 'unknown' })
  throw new Error(`cure_commitment_${stage}_failed`)
}

/** The commitment recorded on a violation. Throws on a failed read: a
 *  commitment that could not be read must not read as "none". */
export async function loadCureCommitment(
  db: CommitmentDb,
  orgId: string,
  violationId: string,
): Promise<CureCommitment | null> {
  const { data, error } = await db
    .from('audit_log')
    .select('action, created_at, metadata')
    .eq('org_id', orgId)
    .eq('entity_type', CURE_COMMITMENT_ENTITY)
    .eq('entity_id', violationId)
    .in('action', [...ACTIONS])
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) fail('audit', error.code)
  return latestCureCommitment((data ?? []) as AuditRow[])
}

/** The org's primary association's rules (first by name — the rule W3 and
 *  /violations/new use). Throws on a failed read. */
export async function loadOrgStateRules(db: CommitmentDb, orgId: string): Promise<StateRuleSet> {
  const { data, error } = await db
    .from('associations')
    .select('state')
    .eq('organization_id', orgId)
    .order('name', { ascending: true })
    .range(0, 0)
  if (error) fail('association', error.code)
  const row = (data ?? [])[0] as { state: string | null } | undefined
  return selectStateRules(row?.state ?? null)
}
