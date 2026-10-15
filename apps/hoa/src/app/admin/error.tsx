'use client'

import * as Sentry from '@sentry/nextjs'
import Link from 'next/link'
import { useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button, Card, CardContent } from '@homeowner-portal/ui'

// Route-level error boundary for the platform-admin tree. Same shape as
// (dashboard)/error.tsx: Sentry capture, no raw message, retry + home,
// digest reference.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: 'admin' } })
  }, [error])

  return (
    <div className="mx-auto w-full max-w-xl py-12">
      <Card>
        <CardContent className="space-y-5 p-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger-subtle text-danger">
            <AlertCircle className="size-6" aria-hidden />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg">Something went wrong in the platform tools</h1>
            <p className="text-sm text-muted">The error has been logged. Try again, or go back to the platform overview.</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => reset()}>Try again</Button>
            <Button asChild variant="secondary">
              <Link href="/admin" className="no-underline">
                Platform overview
              </Link>
            </Button>
          </div>
          {error.digest ? <p className="font-mono text-xs text-muted">Reference: {error.digest}</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}
