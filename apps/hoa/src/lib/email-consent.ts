/**
 * BL-020: per-member consent to receive official association notices by
 * email (California Civ. Code §4040(b): delivery by email needs the
 * member's consent, which they can revoke).
 *
 * Evidence lives in member_email_consent_events (migration 0064): one
 * append-only row per grant or revoke; the newest row per member is their
 * current state. RLS lets a member read and add their own (method
 * 'portal') and the board read all and record a written or emailed consent
 * on a member's behalf ('written' / 'email'). Nobody can edit or delete a
 * row.
 *
 * Inert until M1_APPLIED (packages/db/src/m1.ts): reads report
 * `available: false`, writes refuse, and the audience filter keeps every
 * recipient — today's behaviour. Pass `{ m1 }` to force either state.
 *
 * Takes the caller's client (always the user's RLS-bound client for
 * writes, so recorded_by is really them). No Next imports: the
 * integration suite imports this. Errors are codes, never row values.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { M1_APPLIED } from '@homeowner-portal/db/m1'
import { readAllResult } from './supabase/read-all'

type Client = SupabaseClient<Database>

export type ConsentMethod = 'portal' | 'written' | 'email'

export interface ConsentEvent {
  user_id: string
  granted: boolean
  method: string
  created_at: string
}

export interface ConsentState {
  granted: boolean
  method: ConsentMethod
  at: string
}

export interface M1Options {
  m1?: boolean
}

const TABLE = 'member_email_consent_events'

/** Newest event per member wins. Ties on created_at keep the later row in input order. */
export function currentEmailConsent(events: readonly ConsentEvent[]): Map<string, ConsentState> {
  const out = new Map<string, ConsentState>()
  for (const e of events) {
    const prev = out.get(e.user_id)
    if (prev && Date.parse(prev.at) > Date.parse(e.created_at)) continue
    out.set(e.user_id, { granted: e.granted, method: e.method as ConsentMethod, at: e.created_at })
  }
  return out
}

export type LoadConsentResult =
  | { ok: true; available: false }
  | { ok: true; available: true; consent: Map<string, ConsentState> }
  | { ok: false; error: string }

/** Current consent for the org's members the caller may see (board: all; member: themselves). */
export async function loadEmailConsent(client: Client, orgId: string, opts: M1Options = {}): Promise<LoadConsentResult> {
  if (!(opts.m1 ?? M1_APPLIED)) return { ok: true, available: false }
  // Every page (BL-053): a capped read would silently drop members' consent.
  const { data, error } = await readAllResult<ConsentEvent>((from, to) =>
    client
      .from(TABLE)
      .select('user_id, granted, method, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  )
  if (error) return { ok: false, error: `${TABLE}: ${error.code ?? 'error'}` }
  return { ok: true, available: true, consent: currentEmailConsent(data ?? []) }
}

export type RecordConsentResult = { ok: true } | { ok: false; error: 'not_available' | 'invalid' | 'write_failed'; code?: string }

/**
 * Append one grant or revoke. A member records their own with 'portal';
 * the board records 'written' / 'email' for any member. RLS enforces both
 * rules; this only refuses obviously wrong input early.
 */
export async function recordEmailConsent(
  client: Client,
  input: { orgId: string; userId: string; recordedBy: string; granted: boolean; method: ConsentMethod },
  opts: M1Options = {},
): Promise<RecordConsentResult> {
  if (!(opts.m1 ?? M1_APPLIED)) return { ok: false, error: 'not_available' }
  if (!['portal', 'written', 'email'].includes(input.method)) return { ok: false, error: 'invalid' }
  if (input.method === 'portal' && input.userId !== input.recordedBy) return { ok: false, error: 'invalid' }
  const { error } = await client.from(TABLE).insert({
    organization_id: input.orgId,
    user_id: input.userId,
    recorded_by: input.recordedBy,
    granted: input.granted,
    method: input.method,
  })
  if (error) return { ok: false, error: 'write_failed', code: error.code }
  return { ok: true }
}

/**
 * Official notices to a California association by email go only to members
 * who consented (§4040). Returns who stays on the email channel and how
 * many were left off, for the audience step. Non-CA associations, the flag
 * off, or consent not loaded: everyone stays.
 */
export function filterEmailRecipientsByConsent<T extends { userId: string | null }>(
  recipients: readonly T[],
  args: { state: string | null | undefined; officialNotice: boolean; consent: LoadConsentResult },
): { kept: T[]; excluded: number } {
  const applies =
    args.officialNotice && (args.state ?? '').trim().toUpperCase() === 'CA' && args.consent.ok && args.consent.available
  if (!applies || !args.consent.ok || !args.consent.available) return { kept: [...recipients], excluded: 0 }
  const consent = args.consent.consent
  const kept = recipients.filter((r) => r.userId != null && consent.get(r.userId)?.granted === true)
  return { kept, excluded: recipients.length - kept.length }
}
