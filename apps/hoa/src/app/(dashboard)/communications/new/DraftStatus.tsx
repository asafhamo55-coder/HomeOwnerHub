'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'

/** BL-102 A9: where the composer's autosave stands. */
export type DraftSaveState =
  | { kind: 'idle' }
  | { kind: 'resumed' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string }
  | { kind: 'gone' }

function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s} seconds ago`
  const m = Math.round(s / 60)
  return m === 1 ? '1 minute ago' : `${m} minutes ago`
}

/** "Draft saved just now". A polite live region, so failures are heard too. */
export function DraftStatus({ state }: { state: DraftSaveState }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (state.kind !== 'saved') return
    setNow(Date.now())
    const t = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(t)
  }, [state])

  let content: React.ReactNode = null
  if (state.kind === 'resumed') content = 'Draft. Changes save automatically.'
  else if (state.kind === 'saving')
    content = (
      <>
        <Loader2 className="size-3 animate-spin" aria-hidden /> Saving draft…
      </>
    )
  else if (state.kind === 'saved')
    content = (
      <>
        <Check className="size-3" aria-hidden /> Draft saved {ago(state.at, Math.max(now, state.at))}
      </>
    )
  else if (state.kind === 'error')
    content = (
      <span className="inline-flex items-center gap-1 text-warning">
        <AlertTriangle className="size-3" aria-hidden /> {state.message}
      </span>
    )
  else if (state.kind === 'gone')
    content = (
      <span className="inline-flex items-center gap-1 text-warning">
        <AlertTriangle className="size-3" aria-hidden /> This draft was sent or deleted. Changes here aren’t saved.
      </span>
    )

  return (
    <p role="status" aria-live="polite" className="inline-flex min-h-4 items-center gap-1 text-xs text-muted">
      {content}
    </p>
  )
}
