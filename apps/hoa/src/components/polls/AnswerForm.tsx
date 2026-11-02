'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button } from '@homeowner-portal/ui'
import { answerPollAction } from '@/lib/polls/actions'
import { POLL_ONE_ANSWER_NOTE } from '@/lib/polls/rules'

export interface AnswerHome {
  unitId: string
  label: string
  /** Option ids this home already picked. */
  picked: string[]
}

export function AnswerForm({
  pollId,
  options,
  allowMultiple,
  homes,
}: {
  pollId: string
  options: { id: string; label: string }[]
  allowMultiple: boolean
  homes: AnswerHome[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [unitId, setUnitId] = useState(homes[0]?.unitId ?? '')
  const [picks, setPicks] = useState<Record<string, string[]>>(
    Object.fromEntries(homes.map((h) => [h.unitId, h.picked])),
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const current = picks[unitId] ?? []
  const answeredBefore = homes.find((h) => h.unitId === unitId)?.picked.length ?? 0

  function toggle(id: string) {
    setSaved(false)
    setPicks((p) => {
      const cur = p[unitId] ?? []
      if (!allowMultiple) return { ...p, [unitId]: [id] }
      return { ...p, [unitId]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] }
    })
  }

  function send() {
    setError(null)
    start(async () => {
      const r = await answerPollAction({ pollId, unitId, optionIds: current })
      if (!r.ok) return setError(r.error)
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      {homes.length > 1 ? (
        <div className="space-y-2">
          <label htmlFor="poll-home" className="text-base font-medium">
            Answering for
          </label>
          <select
            id="poll-home"
            className="h-12 w-full rounded-lg border border-border-strong bg-surface px-3 text-base"
            value={unitId}
            onChange={(e) => {
              setUnitId(e.target.value)
              setSaved(false)
            }}
          >
            {homes.map((h) => (
              <option key={h.unitId} value={h.unitId}>
                {h.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <fieldset className="space-y-2">
        <legend className="text-base font-medium">
          {allowMultiple ? 'Pick every answer that fits' : 'Pick one answer'}
        </legend>
        {options.map((o) => (
          <label
            key={o.id}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-border-strong px-4 py-2 text-base"
          >
            <input
              type={allowMultiple ? 'checkbox' : 'radio'}
              name="poll-option"
              className="h-5 w-5"
              checked={current.includes(o.id)}
              onChange={() => toggle(o.id)}
            />
            {o.label}
          </label>
        ))}
      </fieldset>
      <p className="text-sm text-foreground-secondary">{POLL_ONE_ANSWER_NOTE}</p>
      {answeredBefore > 0 && !saved ? (
        <p className="text-base text-foreground-secondary">Your home has answered. You can change it below.</p>
      ) : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      {saved ? <Alert variant="success">Thank you. Your home&rsquo;s answer is saved.</Alert> : null}
      <Button size="lg" disabled={pending || current.length === 0} onClick={send}>
        {pending ? 'Sending...' : answeredBefore > 0 ? 'Change my answer' : 'Send my answer'}
      </Button>
    </div>
  )
}
