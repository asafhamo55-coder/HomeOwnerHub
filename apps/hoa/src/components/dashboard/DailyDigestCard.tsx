'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, AlertTriangle, ChevronRight, Info, RefreshCw, Sparkles } from 'lucide-react'
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

// Severity is an icon AND a colour AND (for screen readers) a word — the
// same vocabulary as the At-risk card's pills.
const SEVERITY: Record<
  BoardInsight['severity'],
  { icon: typeof AlertCircle; className: string; label: string }
> = {
  red: { icon: AlertCircle, className: 'text-danger', label: 'Urgent' },
  amber: { icon: AlertTriangle, className: 'text-warning', label: 'Soon' },
  info: { icon: Info, className: 'text-info', label: 'Note' },
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
    <Card>
      <CardHeader
        className="pb-3"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            loading={loading}
            icon={<RefreshCw aria-hidden />}
            aria-label="Refresh briefing"
          >
            <span className="hidden sm:inline">{loading ? 'Refreshing…' : 'Refresh'}</span>
          </Button>
        }
      >
        <div className="flex items-center gap-2">
          <span
            className="flex size-7 items-center justify-center rounded-lg bg-accent-subtle text-accent-fg"
            aria-hidden
          >
            <Sparkles className="size-4" />
          </span>
          <CardTitle as="h2">Today’s briefing</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {suggestion ? (
          <p className="text-base font-medium leading-relaxed text-foreground">{suggestion}</p>
        ) : null}

        {insights.length > 0 ? (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Needs the board
            </p>
            <ul className="-mx-2">
              {insights.map((insight) => {
                const sev = SEVERITY[insight.severity]
                const Icon = sev.icon
                return (
                  <li key={insight.kind}>
                    <Link
                      href={insight.href}
                      className="group flex gap-3 rounded-lg px-2 py-2 transition-colors duration-fast hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none"
                    >
                      <Icon className={`mt-0.5 size-4 shrink-0 ${sev.className}`} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="sr-only">{sev.label}: </span>
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
                        className="mt-0.5 size-4 shrink-0 text-muted transition-transform duration-fast group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        {bullets.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Since yesterday
            </p>
            <ul className="space-y-1 text-sm text-foreground-secondary">
              {bullets.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-2 inline-block size-1 shrink-0 rounded-full bg-muted" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!hasContent ? <p className="text-sm text-muted">Nothing new since yesterday.</p> : null}

        {generatedAt ? (
          <p className="text-xs text-muted">
            Summary updated {formatDistanceToNow(new Date(generatedAt), { addSuffix: true })}. The
            findings above are computed from your records.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
