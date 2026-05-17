'use client'

import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { Button, Card, CardContent } from '@homeowner-portal/ui'

// Route-level error boundary. Swallows the raw Supabase / framework error
// message (which would otherwise show as plaintext on the page) and gives
// the user two actionable recovery paths.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Surface to the console / Sentry but never to the user.
  // eslint-disable-next-line no-console
  console.error('[dashboard error]', error)

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
              We've logged the error. Try again, or head back to the dashboard
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
