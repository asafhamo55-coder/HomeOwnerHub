'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, RefreshCw, Sparkles } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { formatDistanceToNow } from 'date-fns'

/**
 * One thing in the community that needs the board. `headline`, `href` and
 * `severity` are computed in SQL; only `why` is model-authored, and it is
 * null whenever the model was unavailable or said nothing usable.
 */
interface BoardInsight {
  kind: string
  headline: string
  href: string
  severity: 'red' | 'amber' | 'info'
  why: string | null
}

interface DailyDigestCardProps {
  initialSuggestion: string | null
  initialBullets: string[]
  initialInsights: BoardInsight[]
  initialGeneratedAt: string | null
}

// Same three colours the At-Risk card uses, so red means the same thing in
// both places on one dashboard.
const SEVERITY_DOT: Record<BoardInsight['severity'], string> = {
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  info: 'bg-primary',
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
  initialInsights,
  initialGeneratedAt,
}: DailyDigestCardProps) {
  const [suggestion, setSuggestion] = useState(initialSuggestion)
  const [bullets, setBullets] = useState(initialBullets)
  const [insights, setInsights] = useState(initialInsights)
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt)
  const [loading, setLoading] = useState(false)
  const autoRefreshFired = useRef(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ai/daily-digest', { method: 'POST' })
      if (!res.ok) {
        // No banner — see below — but the endpoint failing every time
        // must leave a trace somewhere. Silent on screen is a deliberate
        // choice; silent everywhere is a blind spot.
        console.error('[daily-digest] refresh failed', res.status)
        return
      }
      const body = await res.json()
      setSuggestion(body.suggestion ?? null)
      setBullets(Array.isArray(body.bullets) ? body.bullets : [])
      setInsights(Array.isArray(body.insights) ? body.insights : [])
      setGeneratedAt(body.generatedAt ?? null)
    } catch (err) {
      // No error state. The bullets and insights on screen are
      // server-rendered and still correct; a failed refresh costs at most
      // a stale suggestion line, which is not worth an alarm banner.
      console.error(
        '[daily-digest] refresh threw',
        err instanceof Error ? err.name : 'UnknownError',
      )
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

  const hasContent = suggestion !== null || bullets.length > 0 || insights.length > 0

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

        {insights.length > 0 ? (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Needs the board
            </p>
            <ul className="space-y-2">
              {insights.map((insight) => (
                <li key={insight.kind}>
                  <Link
                    href={insight.href}
                    className="group flex gap-2 rounded-md px-1 py-1 -mx-1 hover:bg-muted/10"
                  >
                    <span
                      className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[insight.severity]}`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">
                        {insight.headline}
                      </span>
                      {/* Null whenever the model was unavailable. The
                          finding still stands on its own. */}
                      {insight.why ? (
                        <span className="block text-sm text-muted">{insight.why}</span>
                      ) : null}
                    </span>
                    <ChevronRight
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
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
