'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button } from '@homeowner-portal/ui'
import { castBallot } from '@/lib/online-voting/actions'

export interface VoteHome {
  propertyId: string
  label: string
}

/**
 * Three plain steps: pick, check, send. Large targets, 16px text, one main
 * button at a time. After sending, the screen says the vote is recorded and
 * final.
 */
export function VoteForm({
  ballotId,
  options,
  maxSelections,
  homes,
}: {
  ballotId: string
  options: { id: string; label: string }[]
  maxSelections: number
  homes: VoteHome[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [step, setStep] = useState<'pick' | 'check' | 'done'>('pick')
  const [propertyId, setPropertyId] = useState(homes[0]?.propertyId ?? '')
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const single = maxSelections === 1
  const home = homes.find((h) => h.propertyId === propertyId)
  const chosen = options.filter((o) => picked.includes(o.id))

  function toggle(id: string) {
    setError(null)
    setPicked((cur) => {
      if (single) return [id]
      if (cur.includes(id)) return cur.filter((x) => x !== id)
      return cur.length >= maxSelections ? cur : [...cur, id]
    })
  }

  function next() {
    if (picked.length === 0) return setError(single ? 'Pick one choice to go on.' : 'Pick at least one choice to go on.')
    setError(null)
    setStep('check')
  }

  function send() {
    setError(null)
    start(async () => {
      const r = await castBallot(
        ballotId,
        propertyId,
        picked,
        options.map((o) => o.id),
        maxSelections,
      )
      if (!r.ok) {
        setStep('pick')
        return setError(r.error)
      }
      setStep('done')
      router.refresh()
    })
  }

  if (step === 'done') {
    return (
      <div className="space-y-4" role="status">
        <Alert variant="success" title="Your vote is recorded">
          Thank you. {home ? `${home.label} has voted. ` : ''}Your vote is final and can’t be changed. Your board cannot see how you
          voted.
        </Alert>
        {homes.some((h) => h.propertyId !== propertyId) ? (
          <Button
            size="lg"
            className="min-h-14 w-full text-base"
            onClick={() => {
              const other = homes.find((h) => h.propertyId !== propertyId)
              if (other) setPropertyId(other.propertyId)
              setPicked([])
              setError(null)
              setStep('pick')
            }}
          >
            Vote for my other home
          </Button>
        ) : null}
        <Button
          variant={homes.some((h) => h.propertyId !== propertyId) ? 'outline' : 'default'}
          size="lg"
          className="min-h-14 w-full text-base"
          onClick={() => router.push('/resident/vote')}
        >
          Back to ballots
        </Button>
      </div>
    )
  }

  if (step === 'check') {
    return (
      <div className="space-y-5">
        <h2 className="text-xl font-semibold">Check your vote</h2>
        <ul className="space-y-2 rounded-xl border border-border-strong bg-surface p-4 text-base">
          {chosen.map((o) => (
            <li key={o.id} className="font-medium">
              {o.label}
            </li>
          ))}
        </ul>
        <Alert variant="warning" title="You can’t change it after this">
          When you press Send my vote, it is recorded and final. You can’t change it or take it back.
        </Alert>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <Button size="lg" className="min-h-14 w-full text-base" onClick={send} disabled={pending}>
          {pending ? 'Sending...' : 'Send my vote'}
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="min-h-14 w-full text-base"
          onClick={() => setStep('pick')}
          disabled={pending}
        >
          Go back and change
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {homes.length > 1 ? (
        <fieldset className="space-y-2">
          <legend className="text-base font-medium">Which home are you voting for?</legend>
          {homes.map((h) => (
            <label
              key={h.propertyId}
              className="flex min-h-14 items-center gap-3 rounded-xl border border-border-strong bg-surface p-3 text-base"
            >
              <input
                type="radio"
                name="home"
                className="h-6 w-6"
                checked={propertyId === h.propertyId}
                onChange={() => setPropertyId(h.propertyId)}
              />
              {h.label}
            </label>
          ))}
        </fieldset>
      ) : null}
      <fieldset className="space-y-2">
        <legend className="mb-1 text-lg font-semibold">
          {single ? 'Pick one choice' : `Pick up to ${maxSelections} choices`}
        </legend>
        {options.map((o) => {
          const on = picked.includes(o.id)
          return (
            <label
              key={o.id}
              className={`flex min-h-14 items-center gap-3 rounded-xl border p-3 text-base ${on ? 'border-primary bg-subtle font-medium' : 'border-border-strong bg-surface'}`}
            >
              <input
                type={single ? 'radio' : 'checkbox'}
                name="choice"
                className="h-6 w-6"
                checked={on}
                onChange={() => toggle(o.id)}
              />
              {o.label}
            </label>
          )
        })}
        {!single ? (
          <p className="text-sm text-foreground-secondary" aria-live="polite">
            {picked.length} of {maxSelections} picked.
          </p>
        ) : null}
      </fieldset>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Button size="lg" className="min-h-14 w-full text-base" onClick={next}>
        Next: check my vote
      </Button>
      <p className="text-sm text-foreground-secondary">Nothing is sent until you check your vote and press Send.</p>
    </div>
  )
}
