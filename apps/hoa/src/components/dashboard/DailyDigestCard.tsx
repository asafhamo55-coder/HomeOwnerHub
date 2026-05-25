'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, Alert } from '@homeowner-portal/ui'
import { formatDistanceToNow } from 'date-fns'

interface DailyDigestCardProps {
  initialContent: string | null
  initialGeneratedAt: string | null
}

// If the cached digest is older than this, auto-regenerate on mount so
// "Today's digest" stays current without the user clicking Refresh.
// 4h is a sensible default — board members opening the dashboard in
// the morning, midday, and evening each get a fresh digest, but we
// don't burn LLM credits on every page navigation.
const AUTO_REFRESH_AFTER_MS = 4 * 60 * 60 * 1000  // 4 hours

export function DailyDigestCard({ initialContent, initialGeneratedAt }: DailyDigestCardProps) {
  const [content, setContent] = useState(initialContent)
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // Guards against double-fire if React strict mode re-mounts the
  // effect — we only want to auto-refresh once per page open.
  const autoRefreshFired = useRef(false)

  function refresh() {
    setError(null)
    startTransition(async () => {
      const res = await fetch('/api/ai/daily-digest', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body?.message ?? 'Could not generate the digest. Try again shortly.')
        return
      }
      const body = await res.json()
      setContent(body.content)
      setGeneratedAt(body.generatedAt)
    })
  }

  // Auto-refresh on mount when the digest is missing or stale. Stays
  // silent on errors (the user will see the existing content or the
  // empty state and can click Refresh manually).
  useEffect(() => {
    if (autoRefreshFired.current) return
    const isStale =
      !generatedAt ||
      Date.now() - new Date(generatedAt).getTime() > AUTO_REFRESH_AFTER_MS
    if (!isStale) return
    autoRefreshFired.current = true
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasContent = Boolean(content?.trim())

  return (
    <Card variant="elevated">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <CardTitle className="text-base">Today&apos;s digest</CardTitle>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={refresh}
          loading={pending}
          aria-label="Refresh digest"
        >
          <RefreshCw className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <Alert variant="warning" title="AI unavailable">
            {error}
          </Alert>
        ) : null}

        {hasContent ? (
          <ul className="space-y-1.5 text-sm leading-relaxed text-foreground">
            {parseToBullets(content!).map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            No digest yet. Click <span className="font-medium text-foreground">Refresh</span> to
            generate one — or wait for the 7am scheduled run once Inngest is wired up.
          </p>
        )}

        {generatedAt ? (
          <p className="text-xs text-muted">
            Updated {formatDistanceToNow(new Date(generatedAt), { addSuffix: true })} · Claude
            Haiku
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

/**
 * Splits LLM-generated digest content into discrete bullet items.
 *   1. Split on hard line breaks
 *   2. Strip a leading bullet glyph if the LLM already wrote them
 *   3. Discard empty / pure-whitespace lines
 *
 * If the text has no line breaks (single paragraph), tries to split on
 * sentence boundaries (". ") as a fallback so the user gets *some*
 * structure rather than one giant bullet.
 */
function parseToBullets(text: string): string[] {
  const byLine = text
    .split(/\r?\n+/)
    .map((line) => line.trim().replace(/^[-•*]\s+/, ''))
    .filter((line) => line.length > 0)

  if (byLine.length > 1) return byLine

  // Single-blob fallback: split on sentence endings, keep punctuation.
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}
