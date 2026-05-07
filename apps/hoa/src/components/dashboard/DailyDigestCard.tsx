'use client'

import { useState, useTransition } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, Alert } from '@homeownerhub/ui'
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
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{content}</p>
        ) : (
          <p className="text-sm text-muted-fg">
            No digest yet. Click <span className="font-medium text-muted">Refresh</span> to
            generate one — or wait for the 7am scheduled run once Inngest is wired up.
          </p>
        )}

        {generatedAt ? (
          <p className="text-xs text-muted-fg">
            Updated {formatDistanceToNow(new Date(generatedAt), { addSuffix: true })} · Claude
            Haiku
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
