'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { formatDistanceToNow } from 'date-fns'

interface DailyDigestCardProps {
  initialSuggestion: string | null
  initialBullets: string[]
  initialGeneratedAt: string | null
}

/**
 * Once a day, not every four hours. The bullets are server-rendered and
 * always current; the only thing a refresh buys is a fresh suggestion
 * sentence about today, which does not change four times a day.
 */
const AUTO_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000

export function DailyDigestCard({
  initialSuggestion,
  initialBullets,
  initialGeneratedAt,
}: DailyDigestCardProps) {
  const [suggestion, setSuggestion] = useState(initialSuggestion)
  const [bullets, setBullets] = useState(initialBullets)
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt)
  const [loading, setLoading] = useState(false)
  const autoRefreshFired = useRef(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ai/daily-digest', { method: 'POST' })
      if (!res.ok) return
      const body = await res.json()
      setSuggestion(body.suggestion ?? null)
      setBullets(Array.isArray(body.bullets) ? body.bullets : [])
      setGeneratedAt(body.generatedAt ?? null)
    } catch {
      // No error state. The bullets on screen are server-rendered and
      // still correct; a failed refresh costs at most a stale suggestion
      // line, which is not worth an alarm banner.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (autoRefreshFired.current) return
    const isStale =
      !generatedAt || Date.now() - new Date(generatedAt).getTime() > AUTO_REFRESH_AFTER_MS
    if (!isStale) return
    autoRefreshFired.current = true
    refresh()
  }, [generatedAt, refresh])

  const hasContent = suggestion !== null || bullets.length > 0

  return (
    <Card variant="elevated">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <CardTitle className="text-base">Today</CardTitle>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh digest"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{loading ? 'Thinking…' : 'Refresh'}</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {suggestion ? (
          <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm font-medium text-foreground">
            {suggestion}
          </p>
        ) : null}

        {bullets.length > 0 ? (
          <ul className="space-y-1.5 text-sm leading-relaxed text-foreground">
            {bullets.map((line) => (
              <li key={line} className="flex gap-2">
                <span
                  className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                  aria-hidden
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {!hasContent ? (
          <p className="text-sm text-muted">Nothing new since yesterday.</p>
        ) : null}

        {generatedAt ? (
          <p className="text-xs text-muted">
            Updated {formatDistanceToNow(new Date(generatedAt), { addSuffix: true })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
