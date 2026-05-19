'use client'

import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { Button, Card, CardContent } from '@homeowner-portal/ui'

// Route-level error boundary for the platform-admin tree. Same shape as
// the (dashboard)/error.tsx; back-link goes to /admin so platform admins
// land on a known-good page.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // eslint-disable-next-line no-console
  console.error('[admin error]', error)

  return (
    <div className="mx-auto max-w-xl py-12">
      <Card variant="elevated">
        <CardContent className="space-y-4 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-6 w-6" aria-hidden />
          </div>
          <div className="space-y-1">
            <h2>Something went wrong in the platform admin tools</h2>
            <p className="text-sm text-muted">
              The error has been logged. Try again, or head back to the
              platform overview.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={() => reset()}>Try again</Button>
            <Button asChild variant="outline">
              <Link href="/admin">Back to platform overview</Link>
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
