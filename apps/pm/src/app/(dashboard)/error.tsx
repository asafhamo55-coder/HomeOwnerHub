'use client'

import * as Sentry from '@sentry/nextjs'
import Link from 'next/link'
import { useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button, Card, CardContent } from '@homeowner-portal/ui'

// In-shell route error boundary, copied from apps/hoa's (dashboard)/error.tsx.
// The root app/error.tsx renders OUTSIDE the dashboard layout, so a failed
// page used to lose the sidebar too; this one keeps the shell so the user
// can navigate away. Reports to Sentry, never shows the raw message (which
// can carry database detail), offers retry + home, shows the digest.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: 'pm-dashboard' } })
  }, [error])

  return (
    <div className="mx-auto max-w-xl py-12">
      <Card variant="elevated">
        <CardContent className="space-y-4 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-6 w-6" aria-hidden />
          </div>
          <div className="space-y-1">
            <h2>Something went wrong loading this page</h2>
            <p className="text-sm text-muted">
              We&apos;ve logged the error. Try again, or head back to the dashboard
              and tell us what you were doing if it keeps happening.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={() => reset()}>Try again</Button>
            <Button asChild variant="outline">
              <Link href="/">Back to dashboard</Link>
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
