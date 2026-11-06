'use server'

// Server actions for informal polls (B1). Dark behind M9_APPLIED (the store
// answers "not turned on" while it is false). Server actions are public
// endpoints: the board role is re-checked here, and RLS plus
// submit_poll_response() are the real boundary.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'
import { addCalendarDays, instantAtLocalTime, todayIn } from '@/lib/association-time'
import { getResidentUnits } from '@/lib/resident'
import { parsePollInput, type PollInput } from './rules'
import { sendPollEmailNow } from './email/notify'
import type { PollEmailKind, PollEmailStatus } from './email/run'
import {
  createDraftPoll,
  getPoll,
  getResults,
  deleteDraftPoll,
  setPollStatus,
  submitAnswer,
  type PollsClient,
  type StoreResult,
} from './store'

/** What the optional email did. Counts only: homes, never names. */
export interface PollEmailOutcome {
  status: PollEmailStatus
  sent: number
  held: number
  optedOut: number
}

export type PollActionResult = { ok: true; id?: string; email?: PollEmailOutcome } | { ok: false; error: string }

const Id = z.string().uuid()

function fromStore<T>(r: StoreResult<T>, id?: string): PollActionResult {
  return r.ok ? { ok: true, id } : { ok: false, error: r.error }
}

export async function createPollAction(input: PollInput): Promise<PollActionResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'Set up your association first.' }
  const parsed = parsePollInput(
    {
      title: String(input?.title ?? ''),
      description: String(input?.description ?? ''),
      optionsText: String(input?.optionsText ?? ''),
      allowMultiple: input?.allowMultiple === true,
      resultsVisibility: input?.resultsVisibility,
      closesOn: String(input?.closesOn ?? ''),
    },
    todayIn(assoc.timeZone),
  )
  if (!parsed.ok) return parsed

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You are not signed in.' }

  // The last day is inclusive: answers stop at the start of the day after.
  const closesAt = parsed.value.closesOn
    ? instantAtLocalTime(addCalendarDays(parsed.value.closesOn, 1), 0, assoc.timeZone).toISOString()
    : null
  const r = await createDraftPoll(supabase as unknown as PollsClient, {
    organizationId: gate.orgId,
    associationId: assoc.id,
    createdBy: user.id,
    title: parsed.value.title,
    description: parsed.value.description,
    allowMultiple: parsed.value.allowMultiple,
    resultsVisibility: parsed.value.resultsVisibility,
    closesAt,
    options: parsed.value.options,
  })
  revalidatePath('/polls')
  return fromStore(r, r.ok ? r.data.id : undefined)
}

async function boardChange(id: string, run: (c: PollsClient) => Promise<StoreResult<null>>): Promise<PollActionResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!Id.safeParse(id).success) return { ok: false, error: 'Invalid poll.' }
  const supabase = await getSupabaseServerClient()
  const r = await run(supabase as unknown as PollsClient)
  revalidatePath('/polls')
  revalidatePath(`/polls/${id}`)
  revalidatePath('/resident/polls')
  return fromStore(r, id)
}

/**
 * Change the poll's status, then (only when the board asked for it) email
 * residents. The status change is never undone by an email problem: the
 * outcome comes back beside `ok: true` and the screen says what happened.
 */
async function changeAndEmail(
  id: string,
  status: 'open' | 'closed',
  kind: PollEmailKind,
  emailResidents: boolean,
): Promise<PollActionResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!Id.safeParse(id).success) return { ok: false, error: 'Invalid poll.' }
  const supabase = await getSupabaseServerClient()
  const client = supabase as unknown as PollsClient
  const changed = await setPollStatus(client, id, status)
  let email: PollEmailOutcome | undefined
  if (changed.ok && emailResidents) {
    const found = await getPoll(client, id)
    if (found.ok && found.data) {
      const r = await sendPollEmailNow(
        supabase,
        async (pollId) => {
          const res = await getResults(client, pollId)
          if (!res.ok) throw new Error('poll-email: results read failed')
          return res.data
        },
        { kind, pollId: id, associationId: found.data.poll.association_id },
      )
      email = { status: r.status, sent: r.sent, held: r.held, optedOut: r.optedOut }
      revalidatePath('/communications')
    } else {
      email = { status: 'failed', sent: 0, held: 0, optedOut: 0 }
    }
  }
  revalidatePath('/polls')
  revalidatePath(`/polls/${id}`)
  revalidatePath('/resident/polls')
  const base = fromStore(changed, id)
  return base.ok && email ? { ...base, email } : base
}

export async function openPollAction(id: string, options?: { emailResidents?: boolean }) {
  return changeAndEmail(id, 'open', 'opened', options?.emailResidents === true)
}
export async function closePollAction(id: string, options?: { emailResidents?: boolean }) {
  return changeAndEmail(id, 'closed', 'results', options?.emailResidents === true)
}
export async function deletePollAction(id: string) {
  return boardChange(id, (c) => deleteDraftPoll(c, id))
}

const AnswerSchema = z.object({
  pollId: z.string().uuid(),
  unitId: z.string().uuid(),
  optionIds: z.array(z.string().uuid()).min(1).max(20),
})

export async function answerPollAction(input: {
  pollId: string
  unitId: string
  optionIds: string[]
}): Promise<PollActionResult> {
  const parsed = AnswerSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Pick an answer, then press Send.' }
  // Narrowing only: submit_poll_response() re-checks the home against the session.
  const units = await getResidentUnits()
  if (!units.some((u) => u.unit_id === parsed.data.unitId)) {
    return { ok: false, error: 'That home is not on your account.' }
  }
  const supabase = await getSupabaseServerClient()
  const r = await submitAnswer(supabase as unknown as PollsClient, parsed.data)
  revalidatePath(`/resident/polls/${parsed.data.pollId}`)
  return fromStore(r)
}
