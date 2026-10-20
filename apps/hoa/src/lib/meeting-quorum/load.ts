import type { SupabaseClient } from '@supabase/supabase-js'
import { associationTimeZone, todayIn } from '@/lib/association-time'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { loadRosterInput } from '@/lib/properties/statutory-roster/load'
import { buildOwnerRoster, type OwnerRosterRow } from '@/lib/properties/statutory-roster/model'
import { kitEligibility, type KitEligibility } from './quorum'
import { readKit, type KitReadResult } from './store'

/**
 * Server-side reads for the BL-122 quorum kit. The caller has already run
 * the board/admin gate; the cookie-bound client is used so RLS applies on
 * top. Pure model: ./quorum.ts.
 */

export interface KitMeeting {
  id: string
  org_id: string
  meeting_date: string
  meeting_type: string | null
  status: string | null
}

export interface KitAssociation {
  id: string
  name: string | null
  state: string | null
  governing_law_state: string | null
  compliance_settings: unknown
}

export const stateOfAssociation = (a: Pick<KitAssociation, 'state' | 'governing_law_state'> | null | undefined) =>
  (a?.governing_law_state ?? a?.state ?? '').trim().toUpperCase() || null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any }

export async function readKitMeeting(
  supabase: SupabaseClient,
  orgId: string,
  meetingId: string,
): Promise<{ ok: true; meeting: KitMeeting | null } | { ok: false }> {
  const { data, error } = await (supabase as unknown as Loose)
    .from('hoa_meeting_minutes')
    .select('id, org_id, meeting_date, meeting_type, status')
    .eq('id', meetingId)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) {
    console.error('[quorum-kit] meeting read failed', { code: error.code ?? 'unknown' })
    return { ok: false }
  }
  return { ok: true, meeting: (data as KitMeeting | null) ?? null }
}

/** The org's associations, sorted by name; the first is the primary one (as /dues and the roster pick it). */
export async function readKitAssociations(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ ok: true; rows: KitAssociation[] } | { ok: false }> {
  const { data, error } = await (supabase as unknown as Loose)
    .from('associations')
    .select('id, name, state, governing_law_state, compliance_settings')
    .eq('organization_id', orgId)
  if (error) {
    console.error('[quorum-kit] association read failed', { code: error.code ?? 'unknown' })
    return { ok: false }
  }
  const rows = ((data ?? []) as KitAssociation[]).slice().sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  return { ok: true, rows }
}

export interface KitContext {
  meeting: KitMeeting
  association: KitAssociation | null
  state: string | null
  timeZone: string
  today: string
  /** Owners as of this day: the meeting date once it has passed, else today. */
  asOf: string
  rows: OwnerRosterRow[]
  kit: KitReadResult
  eligibility: KitEligibility
}

export type KitLoad =
  | { ok: true; ctx: KitContext }
  | { ok: false; reason: 'not_found' | 'failed' }

export async function loadKitContext(supabase: SupabaseClient, orgId: string, meetingId: string): Promise<KitLoad> {
  const m = await readKitMeeting(supabase, orgId, meetingId)
  if (!m.ok) return { ok: false, reason: 'failed' }
  if (!m.meeting) return { ok: false, reason: 'not_found' }
  const a = await readKitAssociations(supabase, orgId)
  if (!a.ok) return { ok: false, reason: 'failed' }
  const primary = a.rows[0] ?? null
  const timeZone = associationTimeZone(primary ? { state: primary.state } : null)
  const today = todayIn(timeZone)
  const asOf = m.meeting.meeting_date < today ? m.meeting.meeting_date : today

  let rows: OwnerRosterRow[]
  try {
    const roster = await loadRosterInput(supabase, orgId, 'owners', asOf, {
      rows: a.rows.map((r) => ({ id: r.id, name: r.name, state: r.state, governing_law_state: r.governing_law_state })),
      primary: primary
        ? { id: primary.id, name: primary.name, state: primary.state, governing_law_state: primary.governing_law_state }
        : undefined,
      timeZone,
    })
    rows = buildOwnerRoster(roster.input, asOf).rows
  } catch (e) {
    console.error('[quorum-kit] roster read failed', { error: e instanceof Error ? e.message : 'unknown' })
    return { ok: false, reason: 'failed' }
  }

  const kit = primary ? readKit(primary.id, meetingId, primary.compliance_settings, paySettingsSecret()) : readKit('', meetingId, null, null)
  return {
    ok: true,
    ctx: {
      meeting: m.meeting,
      association: primary,
      state: stateOfAssociation(primary),
      timeZone,
      today,
      asOf,
      rows,
      kit,
      eligibility: kitEligibility(m.meeting.meeting_type, kit),
    },
  }
}
