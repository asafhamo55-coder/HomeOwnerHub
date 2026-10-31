'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Pencil, X } from 'lucide-react'
import {
  Alert,
  Button,
  Field,
  Input,
  useToast,
} from '@homeowner-portal/ui'
import { setLeaseCap, suggestLeaseCapFromDocs } from '@/lib/leases'

interface Props {
  associationId: string
  currentCapPct: number | null
  aiSuggestedPct: number | null
  aiSource: string | null
  /** The cap read failed: nothing here may save over a cap the board never saw. */
  disabled?: boolean
}

export function LeaseCapEditor({
  associationId,
  currentCapPct,
  aiSuggestedPct,
  aiSource,
  disabled = false,
}: Props) {
  const router = useRouter()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<string>(
    currentCapPct === null ? '' : String(currentCapPct),
  )
  const [pending, startTransition] = useTransition()
  const [suggestPending, startSuggest] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [lastSuggestion, setLastSuggestion] = useState<{
    pct: number | null
    source: string | null
    answer: string
  } | null>(null)

  function handleSave() {
    if (disabled) return
    setError(null)
    const trimmed = value.trim()
    let capPct: number | null
    if (trimmed === '') {
      capPct = null
    } else {
      const n = Number(trimmed)
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        setError('Cap must be a number between 0 and 100.')
        return
      }
      capPct = n
    }
    startTransition(async () => {
      const result = await setLeaseCap({ associationId, capPct })
      if (!result.ok) {
        setError(result.error)
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Lease cap updated.' })
      setEditing(false)
      router.refresh()
    })
  }

  function handleUseSuggestion(pct: number) {
    startTransition(async () => {
      const result = await setLeaseCap({ associationId, capPct: pct })
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: `Cap set to ${pct}%.` })
      setEditing(false)
      setValue(String(pct))
      router.refresh()
    })
  }

  function handleSuggest() {
    setError(null)
    setLastSuggestion(null)
    startSuggest(async () => {
      const result = await suggestLeaseCapFromDocs(associationId)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        setError(result.error)
        return
      }
      setLastSuggestion({
        pct: result.data.suggestedPct,
        source: result.data.source,
        answer: result.data.answer,
      })
      if (result.data.suggestedPct === null) {
        toast({
          tone: 'info',
          message:
            "AI couldn't find a cap clause in your declaration — set one manually if you have one.",
        })
      } else {
        toast({
          tone: 'success',
          message: `AI suggests ${result.data.suggestedPct}%.`,
        })
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {!editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" disabled={disabled} onClick={() => setEditing(true)} icon={<Pencil aria-hidden />}>
            {currentCapPct === null ? 'Set cap' : 'Edit cap'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={handleSuggest}
            loading={suggestPending}
            icon={<Sparkles aria-hidden />}
          >
            {suggestPending ? 'Reading declaration…' : 'Suggest from declaration'}
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          onSubmit={(e) => {
            e.preventDefault()
            handleSave()
          }}
          noValidate
        >
          <Field label="Rental cap" error={error} hint="Percent of all units. Leave blank to remove the cap." className="sm:w-56">
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 20"
              suffix="%"
              autoFocus
            />
          </Field>
          <div className="flex items-center gap-2 sm:pt-7">
            <Button type="submit" size="sm" loading={pending}>
              Save cap
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false)
                setError(null)
                setValue(currentCapPct === null ? '' : String(currentCapPct))
              }}
              disabled={pending}
              icon={<X aria-hidden />}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {aiSuggestedPct !== null || aiSource ? (
        <Alert variant="info" title="Suggested from your governing documents">
          <div className="space-y-2 text-sm">
            <p>
              Your governing documents{' '}
              {aiSuggestedPct !== null ? (
                <>
                  appear to cap leases at{' '}
                  <span className="font-semibold">{aiSuggestedPct}%</span>
                </>
              ) : (
                <>don&apos;t mention a specific lease cap</>
              )}
              {aiSource ? (
                <>
                  {' '}
                  (per <span className="font-medium">{aiSource}</span>)
                </>
              ) : null}
              .
            </p>
            {aiSuggestedPct !== null && aiSuggestedPct !== currentCapPct ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleUseSuggestion(aiSuggestedPct)}
                disabled={pending}
              >
                Use this
              </Button>
            ) : null}
          </div>
        </Alert>
      ) : null}

      {lastSuggestion ? (
        <div className="rounded-lg border border-border bg-subtle p-4 text-sm">
          <p className="mb-1 font-medium text-foreground">What the declaration says</p>
          <p className="whitespace-pre-wrap leading-relaxed text-foreground-secondary">{lastSuggestion.answer}</p>
        </div>
      ) : null}
    </div>
  )
}
