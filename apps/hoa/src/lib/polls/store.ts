// Reads and writes for informal polls (B1, migration 0074). Every function
// checks M9_APPLIED first; with it false they answer "not available" and touch
// nothing. The tables are not in database.types.ts yet (see
// packages/db/src/polls.types.ts), so the client is reached through a narrow
// cast. RLS is the real boundary: these run with the signed-in user's client.
//
// No 'use server' and no Next imports, so tests can call them with a fake.

import { M9_APPLIED } from '@homeowner-portal/db/m9'
import type { PollOptionRow, PollResultRow, PollRow } from '@homeowner-portal/db/polls-types'

interface Resp<T> {
  data: T | null
  error: { code?: string; message?: string } | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PollsClient = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

export type StoreResult<T> = { ok: true; data: T } | { ok: false; error: string }

const OFF = { ok: false as const, error: 'Polls are not turned on yet.' }
const FAILED = { ok: false as const, error: 'Something went wrong. Try again.' }

function log(what: string, error: { code?: string } | null) {
  // Code only: never row values.
  console.error(`[polls] ${what} failed`, { code: error?.code })
}

export const pollsAvailable = (): boolean => M9_APPLIED

export async function listPolls(client: PollsClient, statuses?: string[]): Promise<StoreResult<PollRow[]>> {
  if (!M9_APPLIED) return OFF
  let q = client.from('polls').select('*').order('created_at', { ascending: false }).limit(100)
  if (statuses) q = q.in('status', statuses)
  const { data, error }: Resp<PollRow[]> = await q
  if (error) return log('list', error), FAILED
  return { ok: true, data: data ?? [] }
}

export async function getPoll(
  client: PollsClient,
  id: string,
): Promise<StoreResult<{ poll: PollRow; options: PollOptionRow[] } | null>> {
  if (!M9_APPLIED) return OFF
  const p: Resp<PollRow> = await client.from('polls').select('*').eq('id', id).maybeSingle()
  if (p.error) return log('get', p.error), FAILED
  if (!p.data) return { ok: true, data: null }
  const o: Resp<PollOptionRow[]> = await client
    .from('poll_options')
    .select('*')
    .eq('poll_id', id)
    .order('position', { ascending: true })
  if (o.error) return log('options', o.error), FAILED
  return { ok: true, data: { poll: p.data, options: o.data ?? [] } }
}

export async function getResults(client: PollsClient, pollId: string): Promise<StoreResult<PollResultRow[]>> {
  if (!M9_APPLIED) return OFF
  const { data, error }: Resp<PollResultRow[]> = await client.rpc('poll_results', { p_poll_id: pollId })
  if (error) return log('results', error), FAILED
  return { ok: true, data: data ?? [] }
}

/** Option ids a home picked, per poll, for the units the caller may read. */
export async function getMyChoices(
  client: PollsClient,
  pollId: string,
  unitIds: string[],
): Promise<StoreResult<Record<string, string[]>>> {
  if (!M9_APPLIED) return OFF
  if (unitIds.length === 0) return { ok: true, data: {} }
  const r: Resp<{ id: string; unit_id: string }[]> = await client
    .from('poll_responses')
    .select('id, unit_id')
    .eq('poll_id', pollId)
    .in('unit_id', unitIds)
  if (r.error) return log('my response', r.error), FAILED
  const rows = r.data ?? []
  if (rows.length === 0) return { ok: true, data: {} }
  const c: Resp<{ response_id: string; option_id: string }[]> = await client
    .from('poll_response_choices')
    .select('response_id, option_id')
    .in('response_id', rows.map((x) => x.id))
  if (c.error) return log('my choices', c.error), FAILED
  const out: Record<string, string[]> = {}
  for (const row of rows) {
    out[row.unit_id] = (c.data ?? []).filter((x) => x.response_id === row.id).map((x) => x.option_id)
  }
  return { ok: true, data: out }
}

export async function createDraftPoll(
  client: PollsClient,
  args: {
    organizationId: string
    associationId: string
    createdBy: string
    title: string
    description: string | null
    allowMultiple: boolean
    resultsVisibility: 'after_close' | 'live'
    closesAt: string | null
    options: string[]
  },
): Promise<StoreResult<{ id: string }>> {
  if (!M9_APPLIED) return OFF
  const ins: Resp<{ id: string }> = await client
    .from('polls')
    .insert({
      organization_id: args.organizationId,
      association_id: args.associationId,
      created_by: args.createdBy,
      title: args.title,
      description: args.description,
      allow_multiple: args.allowMultiple,
      results_visibility: args.resultsVisibility,
      closes_at: args.closesAt,
      status: 'draft',
    })
    .select('id')
    .single()
  if (ins.error || !ins.data) return log('create', ins.error), FAILED
  const id = ins.data.id
  const opts = await client.from('poll_options').insert(
    args.options.map((label, position) => ({ organization_id: args.organizationId, poll_id: id, label, position })),
  )
  if (opts.error) {
    log('create options', opts.error)
    // Drafts can be deleted; do not leave a poll with no answers behind.
    await client.from('polls').delete().eq('id', id)
    return FAILED
  }
  return { ok: true, data: { id } }
}

export async function setPollStatus(
  client: PollsClient,
  id: string,
  status: 'open' | 'closed',
): Promise<StoreResult<null>> {
  if (!M9_APPLIED) return OFF
  const { error }: Resp<unknown> = await client.from('polls').update({ status }).eq('id', id)
  if (error) {
    log('status', error)
    return { ok: false, error: 'That change was not allowed. Check the poll has at least two answers.' }
  }
  return { ok: true, data: null }
}

export async function deleteDraftPoll(client: PollsClient, id: string): Promise<StoreResult<null>> {
  if (!M9_APPLIED) return OFF
  const { error }: Resp<unknown> = await client.from('polls').delete().eq('id', id).eq('status', 'draft')
  if (error) return log('delete', error), FAILED
  return { ok: true, data: null }
}

export async function submitAnswer(
  client: PollsClient,
  args: { pollId: string; unitId: string; optionIds: string[] },
): Promise<StoreResult<null>> {
  if (!M9_APPLIED) return OFF
  const { error }: Resp<unknown> = await client.rpc('submit_poll_response', {
    p_poll_id: args.pollId,
    p_unit_id: args.unitId,
    p_option_ids: args.optionIds,
  })
  if (error) {
    log('answer', error)
    if (error.code === '55000') return { ok: false, error: 'This poll has closed. Your answer was not saved.' }
    if (error.code === '22023') return { ok: false, error: 'Pick an answer, then press Send.' }
    return FAILED
  }
  return { ok: true, data: null }
}
