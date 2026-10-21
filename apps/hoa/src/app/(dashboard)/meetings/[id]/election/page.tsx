import Link from 'next/link'
import { CalendarClock, Printer, Scale, Users, Vote } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  LoadFailed,
  Page,
  StatusPill,
} from '@homeowner-portal/ui'
import { formatDay } from '@/lib/money/format'
import { ELECTION_DISCLAIMER, JURISDICTION_TITLE, electionNotes, type ElectionNote } from '@/lib/elections/law'
import { candidateChecks, contestOf, tallyOf } from '@/lib/elections/model'
import { contestNote, ledgerRule, ledgerVerdict, tallyNote } from '@/lib/elections/guidance'
import { electionTimeline, type StepState } from '@/lib/elections/timeline'
import { electionOf } from '@/lib/elections/store'
import { kitIsOpen, kitMeetingLabel } from '@/lib/meeting-quorum/quorum'
import { MEETING_TYPE } from '@/lib/status/community'
import { LegalDisclaimer } from '@/components/knowledge/LegalDisclaimer'
import { ConfirmMemberMeeting } from '../quorum/ConfirmMemberMeeting'
import { loadElectionPage } from './load-page'
import { AddCandidateForm, CandidateControls, InspectorsForm, QuorumOutcomeForm, ResultsForm, SetupForm } from './ElectionForms'

export const metadata = { title: 'Election planner' }
export const dynamic = 'force-dynamic'

const STEP_PILL: Record<StepState, { tone: 'neutral' | 'info' | 'warning' | 'danger' | 'success'; label: string }> = {
  done_or_passed: { tone: 'neutral', label: 'Date passed' },
  due_soon: { tone: 'warning', label: 'Due soon' },
  upcoming: { tone: 'info', label: 'Upcoming' },
  conflict: { tone: 'danger', label: 'Check the dates' },
  needs_input: { tone: 'neutral', label: 'Needs a date' },
  governing_docs: { tone: 'neutral', label: 'Your bylaws' },
}

function Quotes({ note }: { note: Pick<ElectionNote, 'citations'> }) {
  if (note.citations.length === 0) return null
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-medium">What the statute says</summary>
      <ul className="mt-1 space-y-1.5 text-xs">
        {note.citations.map((c) => (
          <li key={`${c.cite}|${c.quote.slice(0, 24)}`}>
            <span className="font-semibold">{c.cite}:</span> “{c.quote}”
          </li>
        ))}
      </ul>
    </details>
  )
}

function NoteAlert({ note, title }: { note: ElectionNote; title?: string }) {
  return (
    <Alert variant={note.tone === 'warn' ? 'warning' : 'info'} title={title}>
      <p>{note.text}</p>
      <Quotes note={note} />
    </Alert>
  )
}

/**
 * BL-141 — the election planner, paper-first: seats and dates, the state's
 * timeline worked out from the meeting day, candidates checked against the
 * ledger, inspectors (CA), the printed ballot kit, and the results. Board /
 * admin only (loadElectionPage gates before any read). Nothing is sent to
 * owners from here and there is no online voting.
 */
export default async function ElectionPlannerPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const res = await loadElectionPage(id)
  const crumbs = (date?: string) => [
    { label: 'Meetings', href: '/meetings' },
    { label: date ?? 'Meeting', href: `/meetings/${id}` },
    { label: 'Election planner' },
  ]
  if (!res.ok) {
    return (
      <Page title="Election planner" breadcrumbs={crumbs()} linkAs={Link}>
        <LoadFailed what="the election planner" hint="The meeting and its roster couldn’t be read. Nothing was changed." />
      </Page>
    )
  }
  const { ctx } = res
  const date = formatDay(ctx.meeting.meeting_date, 'medium')
  const typeName = ctx.meeting.meeting_type ? (MEETING_TYPE[ctx.meeting.meeting_type] ?? ctx.meeting.meeting_type) : 'Untyped'

  if (!kitIsOpen(ctx.eligibility)) {
    return (
      <Page width="narrow" title="Election planner" breadcrumbs={crumbs(date)} linkAs={Link}>
        {ctx.eligibility === 'special_unconfirmed' ? (
          <ConfirmMemberMeeting meetingId={id} />
        ) : (
          <Alert variant="info" title="Elections are held at a meeting of the members">
            This is a {typeName.toLowerCase()} meeting. Owners elect directors at the annual meeting, or at a special meeting of the
            members. If this is one, edit the meeting and set its type to Annual or Special.
            <span className="mt-3 block">
              <Button asChild variant="secondary" size="sm">
                <Link href={`/meetings/${id}/edit`}>Edit meeting</Link>
              </Button>
            </span>
          </Alert>
        )}
      </Page>
    )
  }

  const j = ctx.jurisdiction
  const election = electionOf(ctx.election)
  const steps = electionTimeline({ jurisdiction: j, meetingType: ctx.meeting.meeting_type, meetingDate: ctx.meeting.meeting_date, election, today: ctx.today })
  const contest = contestOf(election)
  const checks = new Map(candidateChecks(election.candidates, ctx.ledger).map((c) => [c.candidateId, c]))
  const tally = tallyOf(election)
  const homeLabel = new Map(ctx.homes.map((h) => [h.propertyId, h.label]))
  const onBallot = election.candidates.filter((c) => c.onBallot)
  const rule = ledgerRule(j)
  const inspectorLabel = j === 'CA' ? 'Inspectors' : 'Tellers'
  const label = kitMeetingLabel(ctx.meeting.meeting_type)

  return (
    <Page
      width="wide"
      eyebrow={`${label} · ${date}`}
      title="Election planner"
      description="Plan the board election on paper: the dates your state sets, the candidates, the ballot kit and the results. Nothing here is sent to owners."
      breadcrumbs={crumbs(date)}
      linkAs={Link}
    >
      {ctx.election.state === 'unverified' ? (
        <Alert variant="warning" title="The saved election couldn’t be verified">
          It wasn’t written by a board save, so the planner starts empty. Your next change replaces it.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <Vote className="size-4 text-muted" aria-hidden />
                Seats and dates
              </CardTitle>
              <CardDescription>The votes are cast or counted at this meeting, on {date}. The timeline below works back from it.</CardDescription>
            </CardHeader>
            <CardContent>
              <SetupForm
                meetingId={id}
                initial={{ seats: election.seats, nominationDeadline: election.nominationDeadline, ballotsOutOn: election.ballotsOutOn }}
                showBallotsOut={j === 'CA' ? 'required' : 'optional'}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <CalendarClock className="size-4 text-muted" aria-hidden />
                Timeline
              </CardTitle>
              <CardDescription>{JURISDICTION_TITLE[j]}. A passed date isn’t marked done: make sure each step happened.</CardDescription>
            </CardHeader>
            <ol className="divide-y divide-border border-t border-border">
              {steps.map((s) => (
                <li key={s.key} className="space-y-1.5 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {s.date ? (
                        <span className="num mr-2 text-foreground-secondary">
                          {s.when === 'by' ? 'By ' : ''}
                          {formatDay(s.date, 'medium')}
                        </span>
                      ) : null}
                      {s.label}
                    </p>
                    <StatusPill tone={STEP_PILL[s.state].tone} label={s.optional && s.state !== 'conflict' ? 'Optional' : STEP_PILL[s.state].label} />
                  </div>
                  <p className="text-sm text-foreground-secondary">{s.detail}</p>
                  <Quotes note={s} />
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <Users className="size-4 text-muted" aria-hidden />
                Candidates
              </CardTitle>
              <CardDescription>
                The ledger is checked on {formatDay(ctx.check.day, 'medium')}
                {ctx.check.provisional ? ' (today). Check again on the day nominations close' : ''}. Balances are shown here only, never
                printed or saved.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <NoteAlert note={contestNote(j, contest)} />
              {rule ? <NoteAlert note={rule} /> : null}
              {election.candidates.length === 0 ? (
                <EmptyState
                  variant="compact"
                  icon={<Users aria-hidden />}
                  title="No candidates yet"
                  description="Add each person nominated, with their home, as nominations come in."
                />
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {election.candidates.map((c) => {
                    const check = checks.get(c.id)!
                    const v = ledgerVerdict(j, check, ctx.check.day)
                    return (
                      <li key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                            {c.name}
                            {!c.onBallot ? <StatusPill tone="neutral" label="Off the ballot" /> : null}
                            <StatusPill tone={v.tone === 'ok' ? 'success' : v.tone === 'warn' ? 'danger' : 'neutral'} label={v.label} />
                          </p>
                          <p className="text-xs text-foreground-secondary">
                            {c.propertyId ? (homeLabel.get(c.propertyId) ?? 'Home not on the roster') : 'No home linked'}
                            {c.nominatedOn ? ` · nominated ${formatDay(c.nominatedOn, 'medium')}` : ''}
                          </p>
                          <p className="text-xs text-foreground-secondary">{v.text}</p>
                        </div>
                        <CandidateControls meetingId={id} candidateId={c.id} name={c.name} onBallot={c.onBallot} hasVotes={c.votes !== null} />
                      </li>
                    )
                  })}
                </ul>
              )}
              <AddCandidateForm meetingId={id} homes={ctx.homes.map((h) => ({ propertyId: h.propertyId, label: h.label }))} today={ctx.today} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">{j === 'CA' ? 'Inspectors of elections' : 'Tellers'}</CardTitle>
              <CardDescription>
                {j === 'CA'
                  ? 'One or three independent inspectors. They receive the ballots, count them and report the result.'
                  : 'Optional: the people who will count the votes. Their names print on the tally sheet. Check your bylaws for who may count.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {j === 'CA' && election.inspectors.length !== 1 && election.inspectors.length !== 3 ? (
                <Alert variant="warning">California needs one or three inspectors. {election.inspectors.length === 0 ? 'None is entered yet.' : `${election.inspectors.length} are entered.`}</Alert>
              ) : null}
              <InspectorsForm meetingId={id} initial={election.inspectors} label={inspectorLabel} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Results</CardTitle>
              <CardDescription>Record the count after the meeting. Record it in the minutes too.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {j === 'CA' ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Did the count reach quorum?</p>
                  <p className="text-sm text-foreground-secondary">Only if your governing documents require a quorum. If not, you may adjourn to a reconvened meeting with a 20% quorum.</p>
                  <QuorumOutcomeForm meetingId={id} reached={election.quorumReached} reconvenedOn={election.reconvenedOn} />
                </div>
              ) : null}
              {onBallot.length === 0 ? (
                <p className="text-sm text-muted">Add the candidates on the ballot first.</p>
              ) : (
                <>
                  {tally.complete ? (
                    <div className="space-y-3">
                      <NoteAlert note={tallyNote(j, tally)} />
                      <ol className="divide-y divide-border rounded-lg border border-border">
                        {tally.rows.map((r) => (
                          <li key={r.candidate.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                            <span className="min-w-0">
                              <span className="num mr-2 text-muted">{r.rank}.</span>
                              {r.candidate.name}
                            </span>
                            <span className="flex items-center gap-3">
                              <span className="num">{r.votes.toLocaleString()} votes</span>
                              <StatusPill
                                tone={r.outcome === 'elected' ? 'success' : r.outcome === 'tied' ? 'warning' : 'neutral'}
                                label={r.outcome === 'elected' ? 'Most votes' : r.outcome === 'tied' ? 'Tied' : 'Not elected'}
                              />
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                  <ResultsForm
                    meetingId={id}
                    candidates={onBallot.map((c) => ({ id: c.id, name: c.name, votes: c.votes }))}
                    announcedOn={election.resultsAnnouncedOn}
                    meetingDate={ctx.meeting.meeting_date}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <Printer className="size-4 text-muted" aria-hidden />
                Ballot kit
              </CardTitle>
              <CardDescription>
                The ballot, the envelope labels{j === 'CA' ? ', the inspector’s record' : ''} and a tally sheet, to print and copy. No owner is named on the
                ballot.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="secondary" size="sm">
                <Link href={`/meetings/${id}/election/print`}>Open ballot kit</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Quorum kit</CardTitle>
              <CardDescription>
                {j === 'FL' && contest.state !== 'contested' && contest.state !== 'needs_seats'
                  ? 'With no contest, the candidates are seated even without quorum. Use the kit for the meeting’s other business.'
                  : 'Sign-in sheet, proxy forms and a live count, so the election isn’t lost to a missing quorum.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="secondary" size="sm">
                <Link href={`/meetings/${id}/quorum`}>Open quorum kit</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <Scale className="size-4 text-muted" aria-hidden />
                {JURISDICTION_TITLE[j]}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {electionNotes(j).map((n) => (
                <NoteAlert key={n.text} note={n} />
              ))}
            </CardContent>
          </Card>
          <LegalDisclaimer>{ELECTION_DISCLAIMER}</LegalDisclaimer>
        </aside>
      </div>
    </Page>
  )
}
