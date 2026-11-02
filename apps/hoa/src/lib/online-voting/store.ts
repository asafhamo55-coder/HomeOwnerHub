// BL-156: reads for the ballot screens. Dark behind M10_APPLIED (migration 0075).
// RLS decides what each caller sees: drafts only to the board, the box to nobody.
import { M10_APPLIED } from '@homeowner-portal/db'
import type { BallotOptionRow, BallotRow } from '@homeowner-portal/db'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BallotClient = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

export const onlineVotingAvailable = () => M10_APPLIED

export type Read<T> = { ok: true; data: T } | { ok: false }

export async function listBallots(db: BallotClient, statuses?: string[]): Promise<Read<BallotRow[]>> {
  let q = db.from('ballots').select('*').order('created_at', { ascending: false }).limit(100)
  if (statuses) q = q.in('status', statuses)
  const { data, error } = await q
  if (error) {
    console.error('[ballot] list failed', { code: error.code ?? 'unknown' })
    return { ok: false }
  }
  return { ok: true, data: (data ?? []) as BallotRow[] }
}

export async function getBallot(
  db: BallotClient,
  id: string,
): Promise<Read<{ ballot: BallotRow; options: BallotOptionRow[] } | null>> {
  const { data: ballot, error } = await db.from('ballots').select('*').eq('id', id).maybeSingle()
  if (error) return { ok: false }
  if (!ballot) return { ok: true, data: null }
  const { data: options, error: oErr } = await db.from('ballot_options').select('*').eq('ballot_id', id).order('position')
  if (oErr) return { ok: false }
  return { ok: true, data: { ballot: ballot as BallotRow, options: (options ?? []) as BallotOptionRow[] } }
}

export interface VoterHome {
  propertyId: string
  label: string
  voted: boolean
}

/** The homes this signed-in owner may vote for, and whether each already has. Owners only. */
export async function myVoterHomes(db: BallotClient, ballotId: string): Promise<Read<VoterHome[]>> {
  const { data: ids, error } = await db.rpc('ballot_voter_property_ids')
  if (error) return { ok: false }
  const propertyIds = (ids ?? []) as string[]
  if (propertyIds.length === 0) return { ok: true, data: [] }
  const [{ data: props }, { data: voted, error: vErr }] = await Promise.all([
    db.from('hoa_properties').select('id, address').in('id', propertyIds),
    db.from('ballot_voters').select('property_id').eq('ballot_id', ballotId).in('property_id', propertyIds),
  ])
  if (vErr) return { ok: false }
  const done = new Set(((voted ?? []) as { property_id: string }[]).map((r) => r.property_id))
  const addr = new Map(((props ?? []) as { id: string; address: string | null }[]).map((p) => [p.id, p.address]))
  return {
    ok: true,
    data: propertyIds.map((id, i) => ({
      propertyId: id,
      label: addr.get(id) || (propertyIds.length > 1 ? `Home ${i + 1}` : 'Your home'),
      voted: done.has(id),
    })),
  }
}
