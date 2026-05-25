'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, Alert } from '@homeowner-portal/ui'
import { formatDistanceToNow } from 'date-fns'

interface DailyDigestCardProps {
  initialContent: string | null
  initialGeneratedAt: string | null
}

const AUTO_REFRESH_AFTER_MS = 4 * 60 * 60 * 1000  // 4 hours

export function DailyDigestCard({ initialContent, initialGeneratedAt }: DailyDigestCardProps) {
  const [content, setContent] = useState(initialContent)
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const autoRefreshFired = useRef(false)

  const refresh = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/ai/daily-digest', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body?.message ?? 'Could not generate the digest. Try again shortly.')
        return
      }
      const body = await res.json()
      setContent(body.content)
      setGeneratedAt(body.generatedAt)
    } catch {
      setError('Could not reach the AI service. Try again shortly.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (autoRefreshFired.current) return
    const isStale =
      !generatedAt ||
      Date.now() - new Date(generatedAt).getTime() > AUTO_REFRESH_AFTER_MS
    if (!isStale) return
    autoRefreshFired.current = true
    refresh()
  }, [generatedAt, refresh])

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
          disabled={loading}
          aria-label="Refresh digest"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{loading ? 'Generating…' : 'Refresh'}</span>
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
        ) : loading ? (
          <p className="text-sm text-muted">Generating your morning briefing…</p>
        ) : (
          <p className="text-sm text-muted">
            No digest yet. Click <span className="font-medium text-foreground">Refresh</span> to
            generate one.
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

function parseToBullets(text: string): string[] {
  const byLine = text
    .split(/\r?\n+/)
    .map((line) => line.trim().replace(/^[-•*]\s+/, ''))
    .filter((line) => line.length > 0)

  if (byLine.length > 1) return byLine

  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}
