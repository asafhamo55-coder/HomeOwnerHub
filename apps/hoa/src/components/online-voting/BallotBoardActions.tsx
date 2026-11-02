'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button } from '@homeowner-portal/ui'
import { closeBallot, openBallot } from '@/lib/online-voting/actions'

type Basis = 'governing_documents' | 'state_law' | 'both'

/** The required acknowledgement: a basis chosen and every box ticked before Open works. */
export function OpenBallotPanel({
  ballotId,
  statements,
}: {
  ballotId: string
  statements: { id: string; text: string }[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [ticked, setTicked] = useState<string[]>([])
  const [basis, setBasis] = useState<Basis | ''>('')
  const [error, setError] = useState<string | null>(null)
  const ready = basis !== '' && statements.every((s) => ticked.includes(s.id))

  function open() {
    if (basis === '') return
    setError(null)
    start(async () => {
      const r = await openBallot(ballotId, basis, ticked)
      if (!r.ok) return setError(r.error)
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-base font-medium">What lets your association vote online?</legend>
        {(
          [
            ['governing_documents', 'Our governing documents'],
            ['state_law', 'State law'],
            ['both', 'Both'],
          ] as const
        ).map(([v, label]) => (
          <label key={v} className="flex min-h-11 items-center gap-3 text-base">
            <input type="radio" name="basis" className="h-5 w-5" checked={basis === v} onChange={() => setBasis(v)} />
            {label}
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-base font-medium">Confirm each statement</legend>
        {statements.map((s) => (
          <label key={s.id} className="flex min-h-11 items-start gap-3 text-base">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0"
              checked={ticked.includes(s.id)}
              onChange={(e) => setTicked((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id)))}
            />
            {s.text}
          </label>
        ))}
      </fieldset>
      <Alert variant="warning" title="You can’t edit after this">
        Once voting opens, the choices, dates and seats are locked. If something is wrong, run a new ballot or use paper.
      </Alert>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Button size="lg" onClick={open} disabled={!ready || pending}>
        {pending ? 'Opening...' : 'Open voting'}
      </Button>
      {!ready ? <p className="text-sm text-foreground-secondary">Choose a basis and tick every box to open voting.</p> : null}
    </div>
  )
}

export function CloseBallotButton({ ballotId }: { ballotId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="space-y-3">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null)
            const r = await closeBallot(ballotId)
            if (!r.ok) return setError(r.error)
            router.refresh()
          })
        }
      >
        {pending ? 'Closing...' : 'Mark voting as finished'}
      </Button>
    </div>
  )
}
