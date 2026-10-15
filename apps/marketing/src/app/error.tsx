'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

// Root route-level error boundary. Reports to Sentry and shows a generic
// message — never the raw error, which can carry database details.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: 'root' } })
  }, [error])

  return (
    <div className="mx-auto max-w-xl space-y-4 px-6 py-16 text-center">
      <h2 className="text-lg font-semibold">Something went wrong loading this page</h2>
      <p className="text-sm opacity-70">The error has been logged. Please try again.</p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-md border px-4 py-2 text-sm font-medium"
      >
        Try again
      </button>
      {error.digest ? <p className="text-xs opacity-50">Reference: {error.digest}</p> : null}
    </div>
  )
}
