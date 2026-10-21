'use client'

import * as React from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Field, Input, Select, useConfirm, useToast } from '@homeowner-portal/ui'
import { updateElection } from '@/lib/elections/actions'
import { MAX_INSPECTORS, MAX_NAME_LENGTH, MAX_SEATS, type ElectionChange } from '@/lib/elections/model'

/**
 * BL-141 — the election planner's forms. Each one saves through
 * updateElection and then refreshes the server-rendered page (the timeline,
 * the ledger check and the tally are worked out on the server). Nothing
 * here sends a message.
 */

function useSave(meetingId: string) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  function save(change: ElectionChange, done: string, after?: () => void) {
    startTransition(async () => {
      const res = await updateElection(meetingId, change)
      if (!res.ok) {
        toast({ tone: 'error', title: 'Not saved', message: res.error })
        return
      }
      toast({ tone: 'success', message: done })
      after?.()
      router.refresh()
    })
  }
  return { pending, save }
}

const dayOrNull = (s: string) => (s.trim() ? s.trim() : null)

export function SetupForm({
  meetingId,
  initial,
  showBallotsOut,
}: {
  meetingId: string
  initial: { seats: number | null; nominationDeadline: string | null; ballotsOutOn: string | null }
  showBallotsOut: 'required' | 'optional'
}) {
  const { pending, save } = useSave(meetingId)
  const [seats, setSeats] = useState(initial.seats === null ? '' : String(initial.seats))
  const [deadline, setDeadline] = useState(initial.nominationDeadline ?? '')
  const [ballots, setBallots] = useState(initial.ballotsOutOn ?? '')
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = seats.trim() === '' ? null : Number(seats)
    if (n !== null && !(Number.isInteger(n) && n >= 1 && n <= MAX_SEATS)) {
      setError(`Enter a whole number from 1 to ${MAX_SEATS}.`)
      return
    }
    setError(null)
    save({ kind: 'setup', seats: n, nominationDeadline: dayOrNull(deadline), ballotsOutOn: dayOrNull(ballots) }, 'Seats and dates saved.')
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Seats up for election" error={error}>
          <Input inputMode="numeric" value={seats} onChange={(e) => setSeats(e.currentTarget.value)} disabled={pending} placeholder="e.g. 2" />
        </Field>
        <Field label="Nominations close" optional hint="The last day to be nominated.">
          <Input type="date" value={deadline} onChange={(e) => setDeadline(e.currentTarget.value)} disabled={pending} />
        </Field>
        <Field
          label="Ballots go out"
          optional={showBallotsOut === 'optional'}
          hint={showBallotsOut === 'required' ? 'Leave blank to plan from the latest allowed day.' : 'Only if owners vote by mailed ballot.'}
        >
          <Input type="date" value={ballots} onChange={(e) => setBallots(e.currentTarget.value)} disabled={pending} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          Save seats and dates
        </Button>
      </div>
    </form>
  )
}

export interface HomeOption {
  propertyId: string
  label: string
}

const NO_HOME = 'none'

export function AddCandidateForm({ meetingId, homes, today }: { meetingId: string; homes: HomeOption[]; today: string }) {
  const { pending, save } = useSave(meetingId)
  const [name, setName] = useState('')
  const [home, setHome] = useState<string>(NO_HOME)
  const [nominatedOn, setNominatedOn] = useState(today)
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = name.replace(/\s+/g, ' ').trim()
    if (!n || n.length > MAX_NAME_LENGTH) {
      setError(`Enter the name as it should appear on the ballot (up to ${MAX_NAME_LENGTH} characters).`)
      return
    }
    setError(null)
    save(
      { kind: 'add_candidate', name: n, propertyId: home === NO_HOME ? null : home, nominatedOn: dayOrNull(nominatedOn) },
      'Candidate added.',
      () => {
        setName('')
        setHome(NO_HOME)
      },
    )
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem]">
        <Field label="Name on the ballot" required error={error}>
          <Input value={name} onChange={(e) => setName(e.currentTarget.value)} maxLength={MAX_NAME_LENGTH} disabled={pending} />
        </Field>
        <Field label="Their home" optional hint="Used to check the ledger.">
          <Select value={home} onValueChange={setHome} disabled={pending}>
            <option value={NO_HOME}>Not linked</option>
            {homes.map((h) => (
              <option key={h.propertyId} value={h.propertyId}>
                {h.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nominated on" optional>
          <Input type="date" value={nominatedOn} onChange={(e) => setNominatedOn(e.currentTarget.value)} disabled={pending} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={pending} icon={<Plus aria-hidden />}>
          Add candidate
        </Button>
      </div>
    </form>
  )
}

export function CandidateControls({
  meetingId,
  candidateId,
  name,
  onBallot,
  hasVotes,
}: {
  meetingId: string
  candidateId: string
  name: string
  onBallot: boolean
  hasVotes: boolean
}) {
  const { pending, save } = useSave(meetingId)
  const confirm = useConfirm()
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          save(
            { kind: 'candidate_on_ballot', candidateId, onBallot: !onBallot },
            onBallot ? `${name} is off the ballot.` : `${name} is back on the ballot.`,
          )
        }
      >
        {onBallot ? 'Take off ballot' : 'Put back on ballot'}
      </Button>
      {!hasVotes ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          aria-label={`Remove ${name}`}
          icon={<Trash2 aria-hidden />}
          onClick={async () => {
            const ok = await confirm({
              title: `Remove ${name}?`,
              description: 'They come off the candidate list. To keep a record that they withdrew, take them off the ballot instead.',
              confirmLabel: 'Remove',
              destructive: true,
            })
            if (ok) save({ kind: 'remove_candidate', candidateId }, 'Candidate removed.')
          }}
        >
          Remove
        </Button>
      ) : null}
    </span>
  )
}

export function InspectorsForm({ meetingId, initial, label }: { meetingId: string; initial: string[]; label: string }) {
  const { pending, save } = useSave(meetingId)
  const [names, setNames] = useState<string[]>(() => Array.from({ length: MAX_INSPECTORS }, (_, i) => initial[i] ?? ''))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const list = names.map((n) => n.replace(/\s+/g, ' ').trim()).filter(Boolean)
    save({ kind: 'inspectors', names: list }, list.length ? `${label} saved.` : `${label} cleared.`)
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {names.map((n, i) => (
          <Field key={i} label={`${label.replace(/s$/, '')} ${i + 1}`} optional={i > 0}>
            <Input
              value={n}
              maxLength={MAX_NAME_LENGTH}
              disabled={pending}
              onChange={(e) => {
                const v = e.currentTarget.value
                setNames((prev) => prev.map((x, j) => (j === i ? v : x)))
              }}
            />
          </Field>
        ))}
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          Save {label.toLowerCase()}
        </Button>
      </div>
    </form>
  )
}

export function ResultsForm({
  meetingId,
  candidates,
  announcedOn,
  meetingDate,
}: {
  meetingId: string
  candidates: Array<{ id: string; name: string; votes: number | null }>
  announcedOn: string | null
  meetingDate: string
}) {
  const { pending, save } = useSave(meetingId)
  const [votes, setVotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(candidates.map((c) => [c.id, c.votes === null ? '' : String(c.votes)])),
  )
  const [announced, setAnnounced] = useState(announcedOn ?? meetingDate)
  const [error, setError] = useState<string | null>(null)
  const hasResults = candidates.some((c) => c.votes !== null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const parsed: Record<string, number> = {}
    for (const c of candidates) {
      const raw = (votes[c.id] ?? '').trim()
      const n = Number(raw)
      if (raw === '' || !Number.isInteger(n) || n < 0) {
        setError(`Enter the votes for ${c.name} as a whole number (0 if none).`)
        return
      }
      parsed[c.id] = n
    }
    setError(null)
    save({ kind: 'results', votes: parsed, announcedOn: dayOrNull(announced) }, 'Results recorded.')
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {candidates.map((c) => (
          <Field key={c.id} label={`Votes for ${c.name}`}>
            <Input
              inputMode="numeric"
              value={votes[c.id] ?? ''}
              disabled={pending}
              onChange={(e) => {
                const v = e.currentTarget.value
                setVotes((prev) => ({ ...prev, [c.id]: v }))
              }}
            />
          </Field>
        ))}
        <Field label="Results announced on" hint="Starts the challenge period where your state sets one.">
          <Input type="date" value={announced} onChange={(e) => setAnnounced(e.currentTarget.value)} disabled={pending} />
        </Field>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        {hasResults ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => save({ kind: 'clear_results' }, 'Results cleared.')}>
            Clear results
          </Button>
        ) : null}
        <Button type="submit" loading={pending}>
          Record results
        </Button>
      </div>
    </form>
  )
}

export function QuorumOutcomeForm({
  meetingId,
  reached,
  reconvenedOn,
}: {
  meetingId: string
  reached: boolean | null
  reconvenedOn: string | null
}) {
  const { pending, save } = useSave(meetingId)
  const [date, setDate] = useState(reconvenedOn ?? '')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Did the count reach quorum?">
        <Button size="sm" variant={reached === true ? 'primary' : 'secondary'} disabled={pending} onClick={() => save({ kind: 'quorum', reached: true, reconvenedOn: null }, 'Recorded: quorum reached.')}>
          Quorum reached
        </Button>
        <Button
          size="sm"
          variant={reached === false ? 'primary' : 'secondary'}
          disabled={pending}
          onClick={() => save({ kind: 'quorum', reached: false, reconvenedOn: null }, 'Recorded: quorum not reached.')}
        >
          Quorum not reached
        </Button>
        {reached !== null ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => save({ kind: 'quorum', reached: null, reconvenedOn: null }, 'Quorum outcome cleared.')}>
            Clear
          </Button>
        ) : null}
      </div>
      {reached === false ? (
        <form
          noValidate
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            save({ kind: 'quorum', reached: false, reconvenedOn: dayOrNull(date) }, 'Reconvened meeting saved.')
          }}
        >
          <Field label="Reconvened meeting on">
            <Input type="date" value={date} onChange={(e) => setDate(e.currentTarget.value)} disabled={pending} />
          </Field>
          <Button type="submit" size="sm" loading={pending}>
            Save date
          </Button>
        </form>
      ) : null}
    </div>
  )
}
