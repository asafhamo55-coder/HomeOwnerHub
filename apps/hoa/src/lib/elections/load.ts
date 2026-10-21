import type { SupabaseClient } from '@supabase/supabase-js'
import { associationTimeZone, todayIn } from '@/lib/association-time'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { readKitAssociations, readKitMeeting, stateOfAssociation, type KitAssociation, type KitMeeting } from '@/lib/meeting-quorum/load'
import { kitEligibility, type KitEligibility } from '@/lib/meeting-quorum/quorum'
import { readKit } from '@/lib/meeting-quorum/store'
import { loadRosterInput } from '@/lib/properties/statutory-roster/load'
import { buildVoterList, type VoterRow } from '@/lib/properties/statutory-roster/model'
import { electionJurisdiction, type ElectionJurisdiction } from './law'
import { ledgerCheckDay, type LedgerFacts } from './model'
import { readElection, type ElectionReadResult } from './store'

/**
 * Server-side reads for the BL-141 election planner. The caller has already
 * run the board/admin gate; the cookie-bound client is used so RLS applies
 * on top. Pure model: ./model.ts; dates: ./timeline.ts.
 *
 * The roster (homes, owners and the ledger) is read as of the ledger check
 * day — the nomination deadline (FL § 720.306(9)(b)), or today while that
 * is still ahead — so the candidate list shows what each candidate's home
 * owed on that day. Balances are returned to the page only; nothing about
 * them is stored.
 */

export interface ElectionHome {
  propertyId: string
  label: string
  owners: string[]
}

export interface ElectionContext {
  meeting: KitMeeting
  association: KitAssociation | null
  state: string | null
  jurisdiction: ElectionJurisdiction
  today: string
  eligibility: KitEligibility
  election: ElectionReadResult
  homes: ElectionHome[]
  check: { day: string; provisional: boolean }
  ledger: Map<string, LedgerFacts>
}

export type ElectionLoad = { ok: true; ctx: ElectionContext } | { ok: false; reason: 'not_found' | 'failed' }

const homeLabel = (r: Pick<VoterRow, 'address' | 'unitNumber'>) =>
  r.unitNumber ? `${r.address || 'Address not recorded'}, Unit ${r.unitNumber}` : r.address || 'Address not recorded'

export async function loadElectionContext(supabase: SupabaseClient, orgId: string, meetingId: string): Promise<ElectionLoad> {
  const m = await readKitMeeting(supabase, orgId, meetingId)
  if (!m.ok) return { ok: false, reason: 'failed' }
  if (!m.meeting) return { ok: false, reason: 'not_found' }
  const a = await readKitAssociations(supabase, orgId)
  if (!a.ok) return { ok: false, reason: 'failed' }
  const primary = a.rows[0] ?? null
  const timeZone = associationTimeZone(primary ? { state: primary.state } : null)
  const today = todayIn(timeZone)
  const secret = paySettingsSecret()

  const kit = primary ? readKit(primary.id, meetingId, primary.compliance_settings, secret) : readKit('', meetingId, null, null)
  const election = primary ? readElection(primary.id, meetingId, primary.compliance_settings, secret) : readElection('', meetingId, null, null)
  const check = ledgerCheckDay(election, m.meeting.meeting_date, today)

  let rows: VoterRow[]
  try {
    const roster = await loadRosterInput(supabase, orgId, 'voters', check.day, {
      rows: a.rows.map((r) => ({ id: r.id, name: r.name, state: r.state, governing_law_state: r.governing_law_state })),
      primary: primary ? { id: primary.id, name: primary.name, state: primary.state, governing_law_state: primary.governing_law_state } : undefined,
      timeZone,
    })
    rows = buildVoterList(roster.input, check.day).rows
  } catch (e) {
    console.error('[election] roster read failed', { error: e instanceof Error ? e.message : 'unknown' })
    return { ok: false, reason: 'failed' }
  }

  const state = stateOfAssociation(primary)
  return {
    ok: true,
    ctx: {
      meeting: m.meeting,
      association: primary,
      state,
      jurisdiction: electionJurisdiction(state),
      today,
      eligibility: kitEligibility(m.meeting.meeting_type, kit),
      election,
      homes: rows
        .map((r) => ({ propertyId: r.propertyId, label: homeLabel(r), owners: r.owners.map((o) => o.name).filter(Boolean) }))
        .sort((x, y) => x.label.localeCompare(y.label, undefined, { numeric: true })),
      check,
      ledger: new Map(rows.map((r) => [r.propertyId, { pastDueCents: r.delinquency.pastDueCents, daysPastDue: r.delinquency.daysPastDue }])),
    },
  }
}
