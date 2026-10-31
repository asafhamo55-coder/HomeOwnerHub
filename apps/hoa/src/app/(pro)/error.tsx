'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button, Card, CardContent } from '@homeowner-portal/ui'
import { SUPPORT_EMAIL } from '@/lib/support'

// Never shows error details: the message may carry internals. The error goes
// to Sentry; the digest (an opaque id) is the only thing shown.
export default function ProError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: 'pro' } })
  }, [error])

  return (
    <div className="mx-auto max-w-xl py-12">
      <Card variant="elevated">
        <CardContent className="space-y-4 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-6 w-6" aria-hidden />
          </div>
          <div className="space-y-1">
            <h2>This page didn&rsquo;t load</h2>
            <p className="text-sm text-muted">
              Your access is unchanged. Try again in a moment. If it keeps happening, email {SUPPORT_EMAIL} and
              we will look into it.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={() => reset()}>Try again</Button>
            <Button asChild variant="outline">
              <a href={`mailto:${SUPPORT_EMAIL}`}>Contact support</a>
            </Button>
          </div>
          {error.digest ? (
            <p className="text-xs text-muted/70">Reference: {error.digest}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
