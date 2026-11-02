'use server'

// BL-156: online ballots. Dark behind M10_APPLIED (migrations/0075).
//
// The board's draft is written with the service role after the role gate; the
// acknowledgement, opening, closing, voting and counting go through database
// functions called with the caller's own session, so the database re-checks
// who is asking. Nothing is emailed or texted. Errors log codes only (RC-2).

import { revalidatePath } from 'next/cache'
import { M10_APPLIED, createAdminClient } from '@homeowner-portal/db'
import type { BallotResultsRpc } from '@homeowner-portal/db'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ASSOCIATION_ZONE_COLUMNS, associationTimeZone } from '@/lib/association-time'
import { ACK_TEXT_VERSION, onlineVotingRule } from './law'
import { localInputToInstant } from './time'
import { UUID, acknowledgementComplete, checkDraft, checkSelections, rankResults, type DraftInput, type OptionResult } from './model'

const OFF = 'Online voting isn’t switched on yet.'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any }

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

/** The form's fields: the open and close times are wall-clock text on the ASSOCIATION's clock. */
export type DraftForm = Omit<DraftInput, 'opensAt' | 'closesAt'> & { opensLocal: string; closesLocal: string }

export async function createBallotDraft(
  associationId: string,
  meetingId: string | null,
  form: DraftForm,
): Promise<Result<{ ballotId: string }>> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!M10_APPLIED) return { ok: false, error: OFF }
  if (typeof associationId !== 'string' || !UUID.test(associationId) || (meetingId !== null && !UUID.test(meetingId))) {
    return { ok: false, error: 'Invalid input.' }
  }

  const db = createAdminClient() as unknown as Loose
  const { data: assoc, error: aErr } = await db
    .from('associations')
    .select(`id, ${ASSOCIATION_ZONE_COLUMNS}`)
    .eq('id', associationId)
    .eq('organization_id', gate.orgId)
    .maybeSingle()
  if (aErr || !assoc) return { ok: false, error: 'That association isn’t part of your organization.' }
  // The state and the clock come from the association's own row, never from the browser.
  if (onlineVotingRule(assoc.state ?? null).support === 'not_supported') {
    return { ok: false, error: 'Online voting isn’t available for your state yet. Use the paper election kit.' }
  }
  const zone = associationTimeZone(assoc)
  const opensAt = localInputToInstant(form?.opensLocal, zone)
  const closesAt = localInputToInstant(form?.closesLocal, zone)
  if (!opensAt || !closesAt) return { ok: false, error: 'Choose when voting opens and closes.' }
  const checked = checkDraft({ ...form, opensAt, closesAt }, Date.now())
  if (!checked.ok) return checked
  const d = checked.value

  const { data: ballot, error } = await db
    .from('ballots')
    .insert({
      organization_id: gate.orgId,
      association_id: associationId,
      meeting_id: meetingId,
      kind: d.kind,
      title: d.title,
      max_selections: d.maxSelections,
      opens_at: d.opensAt,
      closes_at: d.closesAt,
    })
    .select('id')
    .single()
  if (error || !ballot) {
    console.error('[ballot] create failed', { code: error?.code ?? 'no_row' })
    return { ok: false, error: 'Couldn’t save the ballot. Try again.' }
  }
  const rows = d.options.map((label, position) => ({ organization_id: gate.orgId, ballot_id: ballot.id, label, position }))
  const { error: oErr } = await db.from('ballot_options').insert(rows)
  if (oErr) {
    console.error('[ballot] options failed', { code: oErr.code ?? 'unknown' })
    await db.from('ballots').delete().eq('id', ballot.id).eq('status', 'draft')
    return { ok: false, error: 'Couldn’t save the choices. Try again.' }
  }
  revalidatePath('/meetings')
  return { ok: true, ballotId: ballot.id as string }
}

/** The board ticks every statement, then the ballot opens. The database refuses without the acknowledgement. */
export async function openBallot(
  ballotId: string,
  basis: 'governing_documents' | 'state_law' | 'both',
  tickedStatements: string[],
): Promise<Result> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!M10_APPLIED) return { ok: false, error: OFF }
  if (typeof ballotId !== 'string' || !UUID.test(ballotId)) return { ok: false, error: 'Invalid input.' }
  if (basis !== 'governing_documents' && basis !== 'state_law' && basis !== 'both') return { ok: false, error: 'Invalid input.' }
  if (!Array.isArray(tickedStatements) || !acknowledgementComplete(tickedStatements)) {
    return { ok: false, error: 'Tick every box to confirm before voting opens.' }
  }
  const supabase = (await getSupabaseServerClient()) as unknown as Loose
  // The state rule is read from the ballot's own association, not sent by the browser.
  const { data: b } = await supabase.from('ballots').select('association_id').eq('id', ballotId).maybeSingle()
  const { data: a } = b
    ? await supabase.from('associations').select('state').eq('id', b.association_id).maybeSingle()
    : { data: null }
  if (!b || !a) return { ok: false, error: 'Couldn’t find that ballot.' }
  if (onlineVotingRule(a.state ?? null).support === 'not_supported') {
    return { ok: false, error: 'Online voting isn’t available for your state yet.' }
  }
  const { error } = await supabase.rpc('open_ballot', { p_ballot: ballotId, p_basis: basis, p_text_version: ACK_TEXT_VERSION })
  if (error) {
    console.error('[ballot] open failed', { code: error.code ?? 'unknown' })
    return { ok: false, error: 'Couldn’t open the ballot. Check the choices and the closing time.' }
  }
  revalidatePath('/meetings')
  return { ok: true }
}

const CAST_ERRORS: Record<string, string> = {
  already_voted: 'Your home has already voted. A home gets one vote.',
  ballot_not_open: 'Voting isn’t open right now.',
  not_an_owner_of_this_home: 'Only an owner of this home can vote for it.',
  bad_choice_count: 'Check how many choices you picked.',
}

export async function castBallot(
  ballotId: string,
  propertyId: string,
  selected: string[],
  optionIds: string[],
  maxSelections: number,
): Promise<Result> {
  if (!M10_APPLIED) return { ok: false, error: OFF }
  if (typeof ballotId !== 'string' || !UUID.test(ballotId) || typeof propertyId !== 'string' || !UUID.test(propertyId)) {
    return { ok: false, error: 'Invalid input.' }
  }
  if (!Array.isArray(selected) || !selected.every((s) => typeof s === 'string' && UUID.test(s))) {
    return { ok: false, error: 'Invalid input.' }
  }
  const client = await getSupabaseServerClient()
  const {
    data: { user },
  } = await client.auth.getUser()
  if (!user) return { ok: false, error: 'Sign in to vote.' }
  const supabase = client as unknown as Loose
  const checked = checkSelections(selected, optionIds, maxSelections)
  if (!checked.ok) return checked
  // The database re-checks everything; the client-sent option list is only for the friendly message.
  const { error } = await supabase.rpc('cast_ballot', { p_ballot: ballotId, p_property: propertyId, p_selections: checked.value })
  if (error) {
    const key = Object.keys(CAST_ERRORS).find((k) => String(error.message ?? '').includes(k))
    if (!key) console.error('[ballot] cast failed', { code: error.code ?? 'unknown' })
    return { ok: false, error: key ? CAST_ERRORS[key]! : 'Couldn’t record your vote. Try again.' }
  }
  revalidatePath('/')
  return { ok: true }
}

export async function closeBallot(ballotId: string): Promise<Result> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!M10_APPLIED) return { ok: false, error: OFF }
  if (typeof ballotId !== 'string' || !UUID.test(ballotId)) return { ok: false, error: 'Invalid input.' }
  const supabase = (await getSupabaseServerClient()) as unknown as Loose
  const { error } = await supabase.rpc('close_ballot', { p_ballot: ballotId })
  if (error) {
    console.error('[ballot] close failed', { code: error.code ?? 'unknown' })
    return { ok: false, error: 'Voting hasn’t ended yet.' }
  }
  revalidatePath('/meetings')
  return { ok: true }
}

export async function loadBallotResults(
  ballotId: string,
  seats: number,
): Promise<Result<{ homesVoted: number; ballotsInBox: number; consistent: boolean; rows: OptionResult[] }>> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!M10_APPLIED) return { ok: false, error: OFF }
  if (typeof ballotId !== 'string' || !UUID.test(ballotId) || !Number.isInteger(seats) || seats < 1) {
    return { ok: false, error: 'Invalid input.' }
  }
  const supabase = (await getSupabaseServerClient()) as unknown as Loose
  const { data, error } = await supabase.rpc('ballot_results', { p_ballot: ballotId })
  if (error || !data) {
    return { ok: false, error: 'Results are available once voting ends.' }
  }
  const r = data as BallotResultsRpc
  return {
    ok: true,
    homesVoted: r.homes_voted,
    ballotsInBox: r.ballots_in_box,
    consistent: r.matches,
    rows: rankResults(r.options, seats),
  }
}
