// What the resident home says about polls: how many the resident's homes
// still owe an answer, and the one closing soonest within 3 days. Two reads
// in total (open polls, then the homes' answers), never one per poll. RLS is
// the real boundary; the association and unit filters keep a board member
// previewing the resident view to the homes they are viewing as.

import { M9_APPLIED } from '@homeowner-portal/db/m9'
import { effectiveStatus } from '@/lib/polls/rules'
import type { PollsClient } from '@/lib/polls/store'

export const CLOSING_SOON_DAYS = 3

export interface ClosingSoonPoll {
  id: string
  title: string
  closesAt: string
  associationId: string
}

export interface PollsToAnswer {
  count: number
  closingSoon: ClosingSoonPoll | null
}

export const NO_POLLS_TO_ANSWER: PollsToAnswer = { count: 0, closingSoon: null }

interface UnitRef {
  unit_id: string
  association_id: string | null
}

export function pollBadgeShortText(count: number): string | null {
  return count > 0 ? `${count} to answer` : null
}

export function pollBadgeText(count: number): string | null {
  if (count <= 0) return null
  return count === 1 ? '1 poll to answer' : `${count} polls to answer`
}

export async function loadPollsToAnswer(
  client: PollsClient,
  units: UnitRef[],
  now: Date,
): Promise<PollsToAnswer> {
  if (!M9_APPLIED) return NO_POLLS_TO_ANSWER
  const homes = units.filter((u): u is { unit_id: string; association_id: string } => !!u.association_id)
  if (homes.length === 0) return NO_POLLS_TO_ANSWER
  const associationIds = [...new Set(homes.map((u) => u.association_id))]
  try {
    const polls = await client
      .from('polls')
      .select('id, title, association_id, status, closes_at')
      .eq('status', 'open')
      .in('association_id', associationIds)
      .order('closes_at', { ascending: true, nullsFirst: false })
      .limit(100)
    if (polls.error) throw polls.error
    const open = (
      (polls.data ?? []) as Array<{
        id: string
        title: string
        association_id: string
        status: 'open'
        closes_at: string | null
      }>
    ).filter((p) => effectiveStatus(p, now) === 'open')
    if (open.length === 0) return NO_POLLS_TO_ANSWER

    const answers = await client
      .from('poll_responses')
      .select('poll_id, unit_id')
      .in('poll_id', open.map((p) => p.id))
      .in('unit_id', homes.map((u) => u.unit_id))
    if (answers.error) throw answers.error
    const answered = new Set(
      ((answers.data ?? []) as Array<{ poll_id: string; unit_id: string }>).map((r) => `${r.poll_id}:${r.unit_id}`),
    )

    // Unanswered while any of the resident's homes in that association has not answered.
    const unanswered = open.filter((p) =>
      homes.some((u) => u.association_id === p.association_id && !answered.has(`${p.id}:${u.unit_id}`)),
    )

    const horizon = now.getTime() + CLOSING_SOON_DAYS * 24 * 60 * 60 * 1000
    const soonest = unanswered
      .filter((p) => p.closes_at && new Date(p.closes_at).getTime() <= horizon)
      .sort((a, b) => new Date(a.closes_at as string).getTime() - new Date(b.closes_at as string).getTime())[0]

    return {
      count: unanswered.length,
      closingSoon: soonest ? { id: soonest.id, title: soonest.title, closesAt: soonest.closes_at as string, associationId: soonest.association_id } : null,
    }
  } catch (e) {
    // Code only: never row values. A failed read hides the nudge.
    console.error('[polls] resident badge failed', { code: (e as { code?: string } | null)?.code })
    return NO_POLLS_TO_ANSWER
  }
}

export function closingSoonText(p: ClosingSoonPoll, timeZone: string): string {
  const day = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'short', day: 'numeric' }).format(
    new Date(p.closesAt),
  )
  return `A poll closes on ${day}: ${p.title}`
}
