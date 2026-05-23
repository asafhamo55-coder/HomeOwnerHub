'use client'

import { useState, useTransition } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, Alert } from '@homeowner-portal/ui'
import { formatDistanceToNow } from 'date-fns'

interface DailyDigestCardProps {
  initialContent: string | null
  initialGeneratedAt: string | null
}

export function DailyDigestCard({ initialContent, initialGeneratedAt }: DailyDigestCardProps) {
  const [content, setContent] = useState(initialContent)
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

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
