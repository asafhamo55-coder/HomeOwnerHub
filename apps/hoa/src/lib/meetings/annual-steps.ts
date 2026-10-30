/**
 * Round 15: the annual meeting checklist, as pure data. Takes facts the
 * meeting page already loads and returns ordered steps. A step is only
 * `done` when a reliable signal says so. Quorum, election and report have
 * no saved-state signal today, so they read `check` (the board confirms on
 * that screen) instead of claiming a state we cannot see.
 */

export type AnnualStepStatus = 'done' | 'todo' | 'check'

export interface AnnualStep {
  key: 'notice' | 'quorum' | 'election' | 'report' | 'minutes'
  label: string
  done: boolean
  status: AnnualStepStatus
  href: string
  hint: string
}

export interface AnnualStepFacts {
  meetingId: string
  meetingType: string | null
  /** hoa_meeting_minutes.status */
  status: string | null
  /** The meeting date has passed (association time) or the meeting is approved. */
  held: boolean
  /** Two-letter state, or null when unknown. */
  state: string | null
  /** Latest notice: the record, null when none sent, 'failed' when it could not be read. */
  notice: { communicationId: string } | null | 'failed'
  /** true / false when known; null or omitted when there is no signal (step is kept). */
  hasElection?: boolean | null
}

export function deriveAnnualSteps(f: AnnualStepFacts): AnnualStep[] {
  if (f.meetingType !== 'annual') return []
  const base = `/meetings/${f.meetingId}`
  const georgia = f.state?.toUpperCase() === 'GA'
  const steps: AnnualStep[] = []

  if (f.notice === 'failed') {
    steps.push({
      key: 'notice',
      label: 'Notice sent or posted',
      done: false,
      status: 'check',
      href: `/communications/new?meeting=${f.meetingId}`,
      hint: 'We could not read the notice record. Check the Notice to owners card.',
    })
  } else if (f.notice) {
    steps.push({
      key: 'notice',
      label: 'Notice sent or posted',
      done: true,
      status: 'done',
      href: `/communications/${f.notice.communicationId}`,
      hint: 'A notice went out from HomeownerHub.',
    })
  } else {
    steps.push({
      key: 'notice',
      label: 'Notice sent or posted',
      done: false,
      status: 'todo',
      href: `/communications/new?meeting=${f.meetingId}`,
      hint: f.held ? 'No notice from HomeownerHub. Check your posted copy.' : 'Send the notice to owners.',
    })
  }

  steps.push({
    key: 'quorum',
    label: 'Quorum kit ready',
    done: false,
    status: 'check',
    href: `${base}/quorum`,
    hint: 'Sign-in sheet and proxy forms. Confirm on the kit.',
  })

  if (f.hasElection !== false) {
    steps.push({
      key: 'election',
      label: 'Proxies and election',
      done: false,
      status: 'check',
      href: `${base}/election`,
      hint: 'Only if owners elect directors at this meeting.',
    })
  }

  steps.push({
    key: 'report',
    label: georgia ? 'Annual report saved (§ 44-3-230(a))' : 'Annual report saved',
    done: false,
    status: 'check',
    href: `${base}/annual-report`,
    hint: georgia ? 'Georgia calls for reports to the owners.' : 'Prepare the report for owners.',
  })

  const approved = f.status === 'approved'
  steps.push({
    key: 'minutes',
    label: 'Minutes approved',
    done: approved,
    status: approved ? 'done' : 'todo',
    href: `${base}/edit`,
    hint: approved ? 'The minutes are approved.' : f.held ? 'Approve the minutes.' : 'After the meeting.',
  })

  return steps
}

export function annualProgress(steps: AnnualStep[]): { done: number; total: number } {
  return { done: steps.filter((s) => s.done).length, total: steps.length }
}
