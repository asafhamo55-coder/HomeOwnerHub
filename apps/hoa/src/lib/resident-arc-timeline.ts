// Pure status -> steps mapping for the resident's ARC request timeline.
// arc_requests.status CHECK: submitted, in_review, approved, denied, withdrawn.
// There is no "approved with conditions" status; conditions live in the board note.

export type ArcStepState = 'done' | 'current' | 'upcoming'
export type ArcStepKind = 'submitted' | 'in_review' | 'decision' | 'approved' | 'denied' | 'withdrawn'

export interface ArcTimelineStep {
  id: ArcStepKind
  label: string
  state: ArcStepState
  /** ISO timestamp, or null when we have no date for the step. */
  at: string | null
}

export function arcTimelineSteps(input: {
  status: string
  submitted_at: string
  board_response_at: string | null
}): ArcTimelineStep[] {
  const { status, submitted_at, board_response_at } = input
  const submitted = (state: ArcStepState): ArcTimelineStep => ({
    id: 'submitted',
    label: 'Submitted',
    state,
    at: submitted_at,
  })

  switch (status) {
    case 'submitted':
      return [
        submitted('current'),
        { id: 'in_review', label: 'In review', state: 'upcoming', at: null },
        { id: 'decision', label: 'Board decision', state: 'upcoming', at: null },
      ]
    case 'in_review':
      return [
        submitted('done'),
        { id: 'in_review', label: 'In review', state: 'current', at: null },
        { id: 'decision', label: 'Board decision', state: 'upcoming', at: null },
      ]
    case 'approved':
    case 'denied':
      return [
        submitted('done'),
        { id: 'in_review', label: 'In review', state: 'done', at: null },
        {
          id: status,
          label: status === 'approved' ? 'Approved' : 'Denied',
          state: 'current',
          at: board_response_at,
        },
      ]
    case 'withdrawn':
      return [
        submitted('done'),
        { id: 'withdrawn', label: 'Withdrawn by you', state: 'current', at: null },
      ]
    default:
      // A status this build does not know: show only what we are sure of.
      return [submitted('current')]
  }
}
