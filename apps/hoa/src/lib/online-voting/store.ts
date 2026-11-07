// BL-156: reads for the ballot screens. Dark behind M10_APPLIED (migration 0075).
// RLS decides what each caller sees: drafts only to the board, the box to nobody.
import { M10_APPLIED } from '@homeowner-portal/db'
import type { BallotOptionRow, BallotRow } from '@homeowner-portal/db'
import { unitIdsForProperties } from '@/lib/properties/resolve'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BallotClient = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

export const onlineVotingAvailable = () => M10_APPLIED

export type Read<T> = { ok: true; data: T } | { ok: false }

/**
 * `associationIds` is the viewer's own associations. A resident screen always passes it
 * (an empty list shows nothing); the board screens omit it and RLS shows the whole org.
 */
export async function listBallots(
  db: BallotClient,
  statuses?: string[],
  associationIds?: string[],
  orgId?: string,
): Promise<Read<BallotRow[]>> {
  if (associationIds && associationIds.length === 0) return { ok: true, data: [] }
  let q = db.from('ballots').select('*').order('created_at', { ascending: false }).limit(100)
  if (statuses) q = q.in('status', statuses)
  if (associationIds) q = q.in('association_id', associationIds)
  // Board screens pass the active org: RLS alone shows every org the person belongs to.
  if (orgId) q = q.eq('organization_id', orgId)
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
  associationIds?: string[],
  orgId?: string,
): Promise<Read<{ ballot: BallotRow; options: BallotOptionRow[] } | null>> {
  if (associationIds && associationIds.length === 0) return { ok: true, data: null }
  let bq = db.from('ballots').select('*').eq('id', id)
  if (associationIds) bq = bq.in('association_id', associationIds)
  if (orgId) bq = bq.eq('organization_id', orgId)
  const { data: ballot, error } = await bq.maybeSingle()
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
  // ballot_voter_property_ids() answers for EVERY org the owner is in; this
  // ballot belongs to one, so only that org's homes are shown for it. A home
  // counts as this org's if EITHER the property row says so (when the owner's
  // client can read it) OR one of the owner's units in this org links to it
  // (units.legacy_hoa_property_id, which the voter-ids function also walks).
  // A home whose property row RLS hides is therefore still kept when it is
  // otherwise in scope; it just shows the plain "Your home" label.
  const { data: ballotRow, error: bErr } = await db.from('ballots').select('organization_id').eq('id', ballotId).maybeSingle()
  const ballotOrg = (ballotRow as { organization_id: string } | null)?.organization_id
  if (bErr || !ballotOrg) return { ok: false }
  const [{ data: props }, bridged, { data: voted, error: vErr }] = await Promise.all([
    db.from('hoa_properties').select('id, address, org_id').in('id', propertyIds),
    // The bridge lookup (units of THIS org linked to each property); a failed read just adds nothing.
    unitIdsForProperties(db as never, ballotOrg, propertyIds).catch(() => new Map<string, string>()),
    db.rpc('ballot_homes_voted', { p_ballot: ballotId }),
  ])
  if (vErr) return { ok: false }
  const done = new Set((voted ?? []) as string[])
  const rows = (props ?? []) as { id: string; address: string | null; org_id: string | null }[]
  const addr = new Map(rows.map((p) => [p.id, p.address]))
  const inOrg = new Set<string>([
    ...rows.filter((p) => p.org_id === ballotOrg).map((p) => p.id),
    ...bridged.keys(),
  ])
  const here = propertyIds.filter((id) => inOrg.has(id))
  return {
    ok: true,
    data: here.map((id, i) => ({
      propertyId: id,
      label: addr.get(id) || (here.length > 1 ? `Home ${i + 1}` : 'Your home'),
      voted: done.has(id),
    })),
  }
}
