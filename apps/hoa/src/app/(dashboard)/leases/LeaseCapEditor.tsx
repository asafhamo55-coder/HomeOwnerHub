'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Pencil, X } from 'lucide-react'
import {
  Alert,
  Button,
  Input,
  useToast,
} from '@homeowner-portal/ui'
import { setLeaseCap, suggestLeaseCapFromDocs } from '@/lib/leases'

interface Props {
  associationId: string
  currentCapPct: number | null
  aiSuggestedPct: number | null
  aiSource: string | null
}

export function LeaseCapEditor({
  associationId,
  currentCapPct,
  aiSuggestedPct,
  aiSource,
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
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit cap
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSuggest}
            loading={suggestPending}
            disabled={suggestPending}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {suggestPending ? 'Asking declaration…' : 'Suggest from declaration'}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs font-medium uppercase tracking-wide text-muted">
            Cap %
          </label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 20"
              className="w-32"
            />
            <span className="text-sm text-muted">% of total units</span>
            <Button size="sm" onClick={handleSave} loading={pending} disabled={pending}>
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(false)
                setError(null)
                setValue(currentCapPct === null ? '' : String(currentCapPct))
              }}
              disabled={pending}
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <p className="text-xs text-muted">
            Leave blank to remove the cap. Range 0–100.
          </p>
        </div>
      )}

      {aiSuggestedPct !== null || aiSource ? (
        <Alert variant="info" title="AI suggestion">
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
                  (per <span className="font-mono text-xs">{aiSource}</span>)
                </>
              ) : null}
              .
            </p>
            {aiSuggestedPct !== null && aiSuggestedPct !== currentCapPct ? (
              <Button
                size="sm"
                variant="outline"
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
        <div className="rounded-md border border-border bg-background/40 p-3 text-xs text-muted">
          <p className="mb-1 font-medium text-foreground">AI answer</p>
          <p className="whitespace-pre-wrap leading-relaxed">{lastSuggestion.answer}</p>
        </div>
      ) : null}
    </div>
  )
}
