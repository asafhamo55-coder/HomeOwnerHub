'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Input, Label, Textarea } from '@homeowner-portal/ui'
import { createPollAction } from '@/lib/polls/actions'
import type { ResultsVisibility } from '@/lib/polls/rules'

export function NewPollForm() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [optionsText, setOptionsText] = useState('')
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [visibility, setVisibility] = useState<ResultsVisibility>('after_close')
  const [closesOn, setClosesOn] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const r = await createPollAction({
        title,
        description,
        optionsText,
        allowMultiple,
        resultsVisibility: visibility,
        closesOn,
      })
      if (!r.ok) return setError(r.error)
      router.push(r.id ? `/polls/${r.id}` : '/polls')
    })
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="poll-title">Your question</Label>
        <Input id="poll-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="poll-desc">More detail (optional)</Label>
        <Textarea id="poll-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="poll-options">Answers, one on each line</Label>
        <Textarea
          id="poll-options"
          value={optionsText}
          onChange={(e) => setOptionsText(e.target.value)}
          rows={5}
          placeholder={'Yes\nNo'}
          required
        />
        <p className="text-sm text-foreground-secondary">Between 2 and 20 answers.</p>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-base font-medium">How many answers can a home pick?</legend>
        <label className="flex min-h-11 items-center gap-3 text-base">
          <input type="radio" className="h-5 w-5" checked={!allowMultiple} onChange={() => setAllowMultiple(false)} />
          One answer
        </label>
        <label className="flex min-h-11 items-center gap-3 text-base">
          <input type="radio" className="h-5 w-5" checked={allowMultiple} onChange={() => setAllowMultiple(true)} />
          As many as they like
        </label>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-base font-medium">When do residents see the results?</legend>
        <label className="flex min-h-11 items-center gap-3 text-base">
          <input type="radio" className="h-5 w-5" checked={visibility === 'after_close'} onChange={() => setVisibility('after_close')} />
          After the poll closes
        </label>
        <label className="flex min-h-11 items-center gap-3 text-base">
          <input type="radio" className="h-5 w-5" checked={visibility === 'live'} onChange={() => setVisibility('live')} />
          Right away, as homes answer
        </label>
        <p className="text-sm text-foreground-secondary">You can always see the results.</p>
      </fieldset>
      <div className="space-y-2">
        <Label htmlFor="poll-closes">Last day to answer (optional)</Label>
        <Input id="poll-closes" type="date" value={closesOn} onChange={(e) => setClosesOn(e.target.value)} />
      </div>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Saving...' : 'Save as draft'}
      </Button>
      <p className="text-sm text-foreground-secondary">
        Nothing is sent to residents. After you review the draft, press Open to let residents answer.
      </p>
    </form>
  )
}
