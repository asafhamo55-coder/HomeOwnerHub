/**
 * BL-141: the election's dates, per state, from the meeting day and what
 * the board entered. Pure and browser-safe. Every day count comes from a
 * quote in ./law.ts (law.test.ts pins the numbers to the fixture text);
 * where nothing is loaded the step has no date and says to check the
 * governing documents.
 *
 * Dates are association calendar days (YYYY-MM-DD). "By" a date means on
 * or before it.
 */

import { addCalendarDays, calendarDaysBetween } from '@/lib/association-time'
import { formatDay } from '@/lib/money/format'
import {
  CA_ACCLAMATION,
  CA_ACCLAMATION_INITIAL,
  CA_ACCLAMATION_LAST_ELECTION,
  CA_ACCLAMATION_REMINDER,
  CA_BALLOTS,
  CA_BALLOT_COUNTS_AS_PRESENT,
  CA_CANDIDATE_LIST,
  CA_CHALLENGE,
  CA_COUNT_IN_PUBLIC,
  CA_CUSTODY,
  CA_DAYS,
  CA_ELECTION_NOTICE,
  CA_NOMINATION_NOTICE,
  CA_RECONVENE,
  CA_RECONVENE_NOTICE,
  CA_RESULTS_NOTICE,
  CA_TWO_ENVELOPES,
  FL_AT_ANNUAL_MEETING,
  FL_CHALLENGE,
  FL_CHALLENGE_DAYS,
  FL_DELINQUENT_CANDIDATE,
  FL_MEMBERS,
  FL_MEMBER_NOTICE_DAYS,
  FL_SELF_NOMINATION,
  GA_ANNUAL_NOTICE_DAYS,
  GA_MEMBER_NOTICE,
  GA_OTHER_NOTICE_DAYS,
  GA_QUORUM,
  TX_WRITTEN_SIGNED,
  type ElectionJurisdiction,
  type StatuteCitation,
} from './law'
import type { Election } from './model'

/**
 * done_or_passed — the date has passed (make sure it was done).
 * due_soon       — within SOON_DAYS.
 * upcoming       — later than that.
 * conflict       — the dates entered break the rule (detail says how).
 * needs_input    — a date the board hasn't entered yet.
 * governing_docs — no statute loaded: the bylaws set it.
 */
export type StepState = 'done_or_passed' | 'due_soon' | 'upcoming' | 'conflict' | 'needs_input' | 'governing_docs'

export interface TimelineStep {
  key: string
  label: string
  /** YYYY-MM-DD, or null when no date applies or none is entered. */
  date: string | null
  /** How `date` reads: on or before it, on it, or from it. */
  when: 'by' | 'on' | 'until' | null
  state: StepState
  detail: string
  citations: StatuteCitation[]
  optional?: boolean
}

export const SOON_DAYS = 14

export interface TimelineInput {
  jurisdiction: ElectionJurisdiction
  /** hoa_meeting_minutes.meeting_type: 'annual' or 'special'. */
  meetingType: string | null
  /** The meeting where the votes are cast or counted (the voting deadline in CA). */
  meetingDate: string
  election: Election
  today: string
}

function dated(today: string, date: string): StepState {
  const ahead = calendarDaysBetween(today, date)
  if (ahead < 0) return 'done_or_passed'
  return ahead <= SOON_DAYS ? 'due_soon' : 'upcoming'
}

/** One calendar year on (Feb 29 → Feb 28). */
export function addOneYear(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const last = new Date(Date.UTC(y + 1, m, 0)).getUTCDate()
  return `${String(y + 1).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

function step(today: string, s: Omit<TimelineStep, 'state'> & { state?: StepState }): TimelineStep {
  if (s.state) return s as TimelineStep
  return { ...s, state: s.date ? dated(today, s.date) : 'needs_input' }
}

function governingDocs(key: string, label: string, detail: string): TimelineStep {
  return { key, label, date: null, when: null, state: 'governing_docs', detail, citations: [] }
}

export function electionTimeline(input: TimelineInput): TimelineStep[] {
  switch (input.jurisdiction) {
    case 'GA':
      return georgia(input)
    case 'FL':
      return florida(input)
    case 'CA':
      return california(input)
    case 'TX':
      return texas(input)
    default:
      return generic(input)
  }
}

function nominationsStep(input: TimelineInput, detailIfNone: string, citations: StatuteCitation[] = []): TimelineStep {
  const d = input.election.nominationDeadline
  return d
    ? step(input.today, { key: 'nominations_close', label: 'Nominations close', date: d, when: 'on', detail: 'The last day to be nominated.', citations })
    : { key: 'nominations_close', label: 'Nominations close', date: null, when: null, state: 'needs_input', detail: detailIfNone, citations }
}

function georgia(input: TimelineInput): TimelineStep[] {
  const { meetingDate, today, election } = input
  const annual = input.meetingType !== 'special'
  const days = annual ? GA_ANNUAL_NOTICE_DAYS : GA_OTHER_NOTICE_DAYS
  const steps: TimelineStep[] = [
    step(today, {
      key: 'meeting_notice',
      label: annual ? 'Send the annual meeting notice' : 'Send the special meeting notice',
      date: addCalendarDays(meetingDate, -days),
      when: 'by',
      detail: `At least ${days} days before the meeting, to every owner: the time and place${annual ? '' : ', and the purpose'}. Say that directors will be elected.`,
      citations: [GA_MEMBER_NOTICE],
    }),
    nominationsStep(input, 'Georgia’s Act sets no nomination procedure. If your bylaws set a deadline, enter it above; otherwise nominations are taken as your bylaws say.'),
  ]
  if (election.ballotsOutOn) {
    steps.push(
      step(today, {
        key: 'ballots_out',
        label: 'Ballots or proxies go out',
        date: election.ballotsOutOn,
        when: 'on',
        detail: 'Georgia’s Act sets no ballot-mailing period. Your bylaws decide whether owners vote by mail ballot and how far ahead.',
        citations: [],
      }),
    )
  }
  steps.push(
    step(today, {
      key: 'election',
      label: 'Meeting: vote and count',
      date: meetingDate,
      when: 'on',
      detail: 'Unless your declaration or bylaws say otherwise, quorum is more than one-third of the votes present at the start of the meeting. Use the quorum kit to count it.',
      citations: [GA_QUORUM],
    }),
    governingDocs('results', 'Announce the results', 'Georgia’s Act sets no deadline for announcing results. Record them in the minutes; check your bylaws for any notice to owners.'),
    governingDocs('challenge', 'Challenge period', 'Georgia’s Act sets no election challenge period. Check your bylaws and ask your attorney.'),
  )
  return steps
}

function florida(input: TimelineInput): TimelineStep[] {
  const { meetingDate, today, election } = input
  const checkDay = election.nominationDeadline ?? meetingDate
  const steps: TimelineStep[] = [
    election.nominationDeadline
      ? step(today, {
          key: 'nominations_close',
          label: 'Nominations close',
          date: election.nominationDeadline,
          when: 'on',
          detail: 'Your election process takes nominations in advance, so the association doesn’t have to take them at the meeting.',
          citations: [FL_SELF_NOMINATION],
        })
      : step(today, {
          key: 'nominations_close',
          label: 'Nominations close (at the meeting)',
          date: meetingDate,
          when: 'on',
          detail: 'With no advance deadline, any member may nominate themselves at the meeting. Enter a deadline if your process takes nominations in advance.',
          citations: [FL_SELF_NOMINATION],
        }),
    step(today, {
      key: 'delinquency_check',
      label: 'Check every candidate against the ledger',
      date: checkDay,
      when: 'on',
      detail: 'A candidate who owes anything to the association on the last day to nominate can’t be on the ballot. The candidate list below shows the ledger on that day.',
      citations: [FL_DELINQUENT_CANDIDATE],
    }),
    step(today, {
      key: 'meeting_notice',
      label: 'Send the meeting notice',
      date: addCalendarDays(meetingDate, -FL_MEMBER_NOTICE_DAYS),
      when: 'by',
      detail: `At least ${FL_MEMBER_NOTICE_DAYS} days before the meeting, mailed, delivered or sent electronically to every owner.`,
      citations: [FL_MEMBERS],
    }),
  ]
  if (election.ballotsOutOn) {
    steps.push(
      step(today, {
        key: 'ballots_out',
        label: 'Absentee ballots go out',
        date: election.ballotsOutOn,
        when: 'on',
        detail: 'Only if your governing documents allow absentee secret ballots. Chapter 720 (as loaded) sets no mailing period; check your governing documents.',
        citations: [],
      }),
    )
  }
  steps.push(
    step(today, {
      key: 'election',
      label: 'Annual meeting: election',
      date: meetingDate,
      when: 'on',
      detail: 'Held at or with the annual meeting, unless your governing documents say otherwise.',
      citations: [FL_AT_ANNUAL_MEETING],
    }),
    election.resultsAnnouncedOn
      ? step(today, {
          key: 'challenge',
          label: 'Challenge window closes',
          date: addCalendarDays(election.resultsAnnouncedOn, FL_CHALLENGE_DAYS),
          when: 'by',
          detail: `${FL_CHALLENGE_DAYS} days after the results were announced. A challenge to the election process must start by then.`,
          citations: [FL_CHALLENGE],
        })
      : {
          key: 'challenge',
          label: 'Challenge window',
          date: null,
          when: null,
          state: 'needs_input',
          detail: `${FL_CHALLENGE_DAYS} days from the day the results are announced. Record that day with the results to see the date.`,
          citations: [FL_CHALLENGE],
        },
  )
  return steps
}

function california(input: TimelineInput): TimelineStep[] {
  const { meetingDate, today, election } = input
  const deadline = election.nominationDeadline
  const latestBallotsOut = addCalendarDays(meetingDate, -CA_DAYS.ballots)
  const ballotsOut = election.ballotsOutOn ?? latestBallotsOut
  const generalNoticeBy = addCalendarDays(ballotsOut, -CA_DAYS.generalNotice)
  const steps: TimelineStep[] = []

  if (deadline) {
    steps.push(
      step(today, {
        key: 'acclamation_initial',
        label: 'Optional — acclamation: first notice',
        date: addCalendarDays(deadline, -CA_DAYS.acclamationInitial),
        when: 'by',
        optional: true,
        detail:
          'Only if you may want to seat the candidates by acclamation when there are no more candidates than seats: individual notice at least 90 days before nominations close, a reminder 7 to 30 days before, and a regular election held in the last three years.',
        citations: [CA_ACCLAMATION, CA_ACCLAMATION_INITIAL, CA_ACCLAMATION_LAST_ELECTION],
      }),
      step(today, {
        key: 'acclamation_reminder',
        label: 'Optional — acclamation: reminder notice',
        date: addCalendarDays(deadline, -CA_DAYS.acclamationReminderLatest),
        when: 'by',
        optional: true,
        detail: `Between ${formatDay(addCalendarDays(deadline, -CA_DAYS.acclamationReminderEarliest))} and ${formatDay(addCalendarDays(deadline, -CA_DAYS.acclamationReminderLatest))} (30 to 7 days before nominations close), listing the qualified candidates so far.`,
        citations: [CA_ACCLAMATION_REMINDER],
      }),
      step(today, {
        key: 'nomination_notice',
        label: 'Notice of how and when to nominate',
        date: addCalendarDays(deadline, -CA_DAYS.nominationNotice),
        when: 'by',
        detail: 'General notice of the nomination procedure and deadline, at least 30 days before nominations close.',
        citations: [CA_NOMINATION_NOTICE],
      }),
    )
  }
  steps.push(
    nominationsStep(
      input,
      `Enter the nomination deadline. Nominations must close by ${formatDay(generalNoticeBy)}, so the election notice can list every candidate.`,
      [],
    ),
  )
  if (deadline && deadline > generalNoticeBy) {
    const last = steps[steps.length - 1]!
    steps[steps.length - 1] = {
      ...last,
      state: 'conflict',
      detail: `Nominations close after ${formatDay(generalNoticeBy)}, the day the election notice must go out with the list of candidates. Close nominations earlier or move the ballots and the meeting later.`,
      citations: [CA_ELECTION_NOTICE, CA_CANDIDATE_LIST],
    }
  }
  steps.push(
    step(today, {
      key: 'election_notice',
      label: 'Election notice',
      date: generalNoticeBy,
      when: 'by',
      detail:
        (election.ballotsOutOn ? '' : 'Worked back from the latest day ballots can go out. ') +
        'At least 30 days before ballots go out: where and by when ballots are returned, the date, time and place of the count meeting, the list of candidates, and, if your documents require a quorum, that a reconvened meeting at a 20% quorum may follow.',
      citations: [CA_ELECTION_NOTICE, CA_CANDIDATE_LIST],
    }),
  )
  const ballotsStep = step(today, {
    key: 'ballots_out',
    label: 'Mail ballots with two envelopes',
    date: election.ballotsOutOn ?? latestBallotsOut,
    when: election.ballotsOutOn ? 'on' : 'by',
    detail: 'At least 30 days before voting closes, by first-class mail or delivery to every member: the ballot, a blank inner envelope and an outer envelope addressed to the inspector. Print them from the ballot kit.',
    citations: [CA_BALLOTS, CA_TWO_ENVELOPES],
  })
  if (election.ballotsOutOn && election.ballotsOutOn > latestBallotsOut) {
    ballotsStep.state = 'conflict'
    ballotsStep.detail = `Ballots go out ${calendarDaysBetween(election.ballotsOutOn, meetingDate)} days before voting closes. They must go out by ${formatDay(latestBallotsOut)}, at least 30 days before.`
  }
  steps.push(
    ballotsStep,
    step(today, {
      key: 'election',
      label: 'Voting closes; count in public',
      date: meetingDate,
      when: 'on',
      detail: 'The inspector counts the ballots at a properly noticed open meeting. Every ballot received counts as a member present for quorum.',
      citations: [CA_COUNT_IN_PUBLIC, CA_BALLOT_COUNTS_AS_PRESENT],
    }),
  )

  let electionDay = meetingDate
  if (election.quorumReached === false) {
    const earliest = addCalendarDays(meetingDate, CA_DAYS.reconveneAfter)
    if (election.reconvenedOn) {
      electionDay = election.reconvenedOn
      const reconvene = step(today, {
        key: 'reconvened',
        label: 'Reconvened meeting (20% quorum)',
        date: election.reconvenedOn,
        when: 'on',
        detail: 'At least 20 days after the first meeting. The quorum is 20% of the members, unless your documents set a lower one.',
        citations: [CA_RECONVENE],
      })
      if (election.reconvenedOn < earliest) {
        reconvene.state = 'conflict'
        reconvene.detail = `The reconvened meeting must be at least 20 days after the first one: ${formatDay(earliest)} or later.`
      }
      steps.push(
        step(today, {
          key: 'reconvene_notice',
          label: 'Notice of the reconvened meeting',
          date: addCalendarDays(election.reconvenedOn, -CA_DAYS.reconveneNotice),
          when: 'by',
          detail: 'General notice at least 15 days before: the date, time and place, the list of candidates, and the 20% quorum statement.',
          citations: [CA_RECONVENE_NOTICE],
        }),
        reconvene,
      )
    } else {
      steps.push({
        key: 'reconvened',
        label: 'Reconvened meeting (20% quorum)',
        date: null,
        when: null,
        state: 'needs_input',
        detail: `Quorum wasn’t reached. You may adjourn to a day at least 20 days later (${formatDay(earliest)} or after) with a 20% quorum. Enter the date to see the notice deadline.`,
        citations: [CA_RECONVENE],
      })
    }
  }

  steps.push(
    step(today, {
      key: 'results_notice',
      label: 'Notice of the results',
      date: addCalendarDays(electionDay, CA_DAYS.results),
      when: 'by',
      detail: 'General notice of the tabulated results within 15 days of the election, and in the minutes of the next board meeting.',
      citations: [CA_RESULTS_NOTICE],
    }),
    election.resultsAnnouncedOn
      ? step(today, {
          key: 'challenge',
          label: 'Challenge period ends; ballots to the association',
          date: addOneYear(election.resultsAnnouncedOn),
          when: 'by',
          detail: 'A member may sue within one year of the results notice (or later, if the cause of action accrues later). The inspector keeps the ballots, envelopes and lists until then.',
          citations: [CA_CHALLENGE, CA_CUSTODY],
        })
      : {
          key: 'challenge',
          label: 'Challenge period',
          date: null,
          when: null,
          state: 'needs_input',
          detail: 'One year from the results notice. Record the day the results were announced to see the date. The inspector keeps the ballots until then.',
          citations: [CA_CHALLENGE, CA_CUSTODY],
        },
  )
  return steps
}

function texas(input: TimelineInput): TimelineStep[] {
  const { meetingDate, today, election } = input
  const steps: TimelineStep[] = [
    governingDocs(
      'meeting_notice',
      'Send the meeting notice',
      'Texas’s notice rules (Prop. Code §§ 209.0051 and 209.00592–209.00594) aren’t loaded in HomeownerHub. Check your governing documents for how far ahead to send it.',
    ),
    nominationsStep(input, 'Check your governing documents for how nominations are taken, then enter the deadline.'),
  ]
  if (election.ballotsOutOn) {
    steps.push(
      step(today, {
        key: 'ballots_out',
        label: 'Ballots go out',
        date: election.ballotsOutOn,
        when: 'on',
        detail: 'A vote in a contested board election must be in writing and signed (or secret, if your association adopted secret-ballot rules).',
        citations: [TX_WRITTEN_SIGNED],
      }),
    )
  }
  steps.push(
    step(today, {
      key: 'election',
      label: 'Meeting: vote and count',
      date: meetingDate,
      when: 'on',
      detail: 'Written, signed ballots are needed only when the race is contested.',
      citations: [TX_WRITTEN_SIGNED],
    }),
    governingDocs('results', 'Announce the results', 'Check your governing documents for when and how to announce the results.'),
  )
  return steps
}

function generic(input: TimelineInput): TimelineStep[] {
  const { meetingDate, today } = input
  return [
    governingDocs('meeting_notice', 'Send the meeting notice', 'Check your bylaws for how far ahead to send the notice.'),
    nominationsStep(input, 'Check your bylaws for how nominations are taken, then enter the deadline.'),
    step(today, { key: 'election', label: 'Meeting: vote and count', date: meetingDate, when: 'on', detail: 'Check your bylaws for the quorum and how votes are cast.', citations: [] }),
    governingDocs('results', 'Announce the results', 'Check your bylaws for when and how to announce the results.'),
  ]
}

/** The first step still ahead (or due today), for the meeting page's card. */
export function nextStep(steps: readonly TimelineStep[]): TimelineStep | null {
  return steps.find((s) => s.state === 'conflict') ?? steps.find((s) => s.state === 'due_soon' || s.state === 'upcoming') ?? null
}
