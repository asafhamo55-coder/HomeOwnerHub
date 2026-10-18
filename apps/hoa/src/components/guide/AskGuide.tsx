'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Alert, Button, Textarea, cn } from '@homeowner-portal/ui'
import { responseErrorMessage } from '@/lib/api/client'
import type { AskResult } from '@/lib/guide/ask'
import { trackHelp } from '@/lib/guide/track'
import { AskGuideResult } from './AskGuideResult'

export const ASK_MAX_CHARS = 500
const FAILED = 'Couldn’t ask the guide just now. Try again, or search the articles instead.'

export type AskState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; result: AskResult }
  | { status: 'failed'; message: string }

/**
 * "Ask the guide" (spec §6.3): a question box over POST /api/help/ask.
 * Used on /help, /resident/help and in the "?" drawer (`route` set to the
 * page the drawer opened on, so that page's articles rank first).
 *
 * The answer region is aria-live. The question stays in this component's
 * state only: it is not put in the URL, storage or analytics.
 */
export function AskGuide({
  route,
  compact = false,
  initialQuestion = '',
  autoSubmit = false,
  onNavigate,
  heading = 'Ask the guide',
  initialState = { status: 'idle' },
}: {
  route?: string
  compact?: boolean
  initialQuestion?: string
  /** Ask `initialQuestion` straight away (⌘K "Ask the guide: …"). */
  autoSubmit?: boolean
  onNavigate?: () => void
  heading?: string
  /** For tests and previews: render a given state without fetching. */
  initialState?: AskState
}) {
  const id = useId()
  const [question, setQuestion] = useState(initialQuestion)
  const [state, setState] = useState<AskState>(initialState)
  const inflight = useRef<AbortController | null>(null)

  async function ask(q: string) {
    const text = q.trim()
    if (text.length < 3) return
    inflight.current?.abort()
    const ctrl = new AbortController()
    inflight.current = ctrl
    setState({ status: 'loading' })
    try {
      const res = await fetch('/api/help/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(route ? { question: text, route } : { question: text }),
        signal: ctrl.signal,
      })
      if (!res.ok) {
        setState({ status: 'failed', message: await responseErrorMessage(res, FAILED) })
        return
      }
      setState({ status: 'done', result: (await res.json()) as AskResult })
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return
      setState({ status: 'failed', message: FAILED })
    }
  }

  useEffect(() => {
    if (autoSubmit && initialQuestion.trim()) void ask(initialQuestion)
    return () => inflight.current?.abort()
    // Only on mount / when a new prefilled question arrives.
  }, [autoSubmit, initialQuestion])

  const loading = state.status === 'loading'

  return (
    <section aria-labelledby={`${id}-h`} className="space-y-3">
      <h2 id={`${id}-h`} className={cn('flex items-center gap-2 text-foreground', compact ? 'text-xs font-semibold uppercase tracking-wide text-muted' : 'text-lg')}>
        {compact ? null : <Sparkles className="size-4 text-primary" aria-hidden />}
        {heading}
      </h2>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          void ask(question)
        }}
      >
        <label htmlFor={`${id}-q`} className="sr-only">
          Your question about using HomeownerHub
        </label>
        <Textarea
          id={`${id}-q`}
          name="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void ask(question)
            }
          }}
          maxLength={ASK_MAX_CHARS}
          showCount={false}
          rows={compact ? 2 : 3}
          placeholder="How do I record a check payment?"
          autoComplete="off"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">Answers come from the guide, with links to the articles.</p>
          <Button type="submit" size={compact ? 'sm' : 'md'} disabled={loading || question.trim().length < 3}>
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {loading ? 'Asking…' : 'Ask'}
          </Button>
        </div>
      </form>
      <div aria-live="polite" aria-busy={loading}>
        {state.status === 'done' ? (
          <AskGuideResult
            result={state.result}
            compact={compact}
            onNavigate={onNavigate}
            onTakeMeThere={(articleId) => articleId && trackHelp({ event: 'help.take_me_there', articleId, source: 'ask' })}
          />
        ) : state.status === 'failed' ? (
          <Alert variant="error" title="Something went wrong">
            {state.message}
          </Alert>
        ) : loading ? (
          <p className="text-sm text-muted">Looking in the guide…</p>
        ) : null}
      </div>
    </section>
  )
}
