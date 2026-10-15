import * as React from 'react'
import { Alert } from './Alert'

/**
 * What a page shows when a query it depends on failed.
 *
 * The audit's top finding was pages that rendered their EMPTY state when a
 * query errored — "No violations on file", "All caught up" — so an RLS
 * denial or a timeout told a treasurer there was nothing owed. This is the
 * third state between "loaded" and "empty": it says plainly that the data
 * could not be loaded, which is different from there being none.
 *
 * Deliberately takes no error object or message. Raw database messages can
 * carry row values and schema detail, and showing them to a user is what
 * the route error boundaries were written to prevent. Logging is the
 * caller's job (apps/hoa `loadOrFail` reports to Sentry before the page
 * ever renders this), which keeps this package free of a Sentry dependency
 * and safe to render on the client.
 */
export interface LoadFailedProps {
  /** Plural noun for what is missing: "violations", "your dues". */
  what: string
  /**
   * Where a "Try again" link goes. Omitted, the copy asks the user to
   * refresh instead (an empty `href` is dropped by React, and `?` would
   * discard the page's own query params).
   */
  retryHref?: string
  /** Optional extra sentence, e.g. what still works on the page. */
  hint?: React.ReactNode
  className?: string
}

export function LoadFailed({ what, retryHref, hint, className }: LoadFailedProps) {
  return (
    <Alert variant="error" title={`Couldn’t load ${what}`} className={className}>
      <p>
        This is a loading problem, not an empty list — don’t read it as “none”.
        We’ve logged it.{' '}
        {retryHref ? (
          <a href={retryHref} className="font-medium underline">
            Try again
          </a>
        ) : (
          'Refresh the page to try again.'
        )}
      </p>
      {hint ? <p className="mt-1">{hint}</p> : null}
    </Alert>
  )
}
