'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Input, Label, Textarea } from '@homeowner-portal/ui'
import { createBallotDraft } from '@/lib/online-voting/actions'
import type { BallotKind } from '@/lib/online-voting/model'

/** datetime-local has no zone, so the device's zone is used. */
const toIso = (local: string) => {
  const t = Date.parse(local)
  return Number.isFinite(t) ? new Date(t).toISOString() : ''
}

export function NewBallotForm({ associationId, state }: { associationId: string; state: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<BallotKind>('election')
  const [title, setTitle] = useState('')
  const [seats, setSeats] = useState('1')
  const [optionsText, setOptionsText] = useState('')
  const [opensAt, setOpensAt] = useState('')
  const [closesAt, setClosesAt] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const r = await createBallotDraft(associationId, state, null, {
        kind,
        title,
        maxSelections: kind === 'question' ? 1 : Number(seats),
        options: optionsText.split('\n'),
        opensAt: toIso(opensAt),
        closesAt: toIso(closesAt),
      })
      if (!r.ok) return setError(r.error)
      router.push(`/ballots/${r.ballotId}`)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="text-base font-medium">What are owners voting on?</legend>
        <label className="flex min-h-11 items-center gap-3 text-base">
          <input type="radio" name="kind" className="h-5 w-5" checked={kind === 'election'} onChange={() => setKind('election')} />
          Electing directors (pick from candidates)
        </label>
        <label className="flex min-h-11 items-center gap-3 text-base">
          <input type="radio" name="kind" className="h-5 w-5" checked={kind === 'question'} onChange={() => setKind('question')} />
          A question (pick one answer)
        </label>
      </fieldset>
      <div className="space-y-2">
        <Label htmlFor="b-title">Title owners will see</Label>
        <Input id="b-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      </div>
      {kind === 'election' ? (
        <div className="space-y-2">
          <Label htmlFor="b-seats">How many seats are open?</Label>
          <Input
            id="b-seats"
            type="number"
            inputMode="numeric"
            min={1}
            max={25}
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
            required
          />
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="b-options">{kind === 'election' ? 'Candidates, one on each line' : 'Answers, one on each line'}</Label>
        <Textarea
          id="b-options"
          value={optionsText}
          onChange={(e) => setOptionsText(e.target.value)}
          rows={6}
          placeholder={kind === 'election' ? 'Candidate one\nCandidate two\nCandidate three' : 'Yes\nNo'}
          required
        />
        <p className="text-sm text-foreground-secondary">There must be more choices than seats.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="b-opens">Voting opens</Label>
          <Input id="b-opens" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="b-closes">Voting closes</Label>
          <Input id="b-closes" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} required />
        </div>
      </div>
      <p className="text-sm text-foreground-secondary">Times use the time zone of this device.</p>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Saving...' : 'Save as draft'}
      </Button>
      <p className="text-sm text-foreground-secondary">
        Nothing is sent to owners. You review the draft and confirm before voting opens. You share the link yourself.
      </p>
    </form>
  )
}
