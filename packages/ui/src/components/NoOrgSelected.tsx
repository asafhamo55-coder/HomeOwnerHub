import * as React from 'react'
import { Building2 } from 'lucide-react'
import { EmptyState } from './EmptyState'

/**
 * What a page renders when it cannot resolve the current organization.
 *
 * Seventeen pages across the three apps used to `return null` here, which
 * showed a blank white content area inside a working shell — indistinguishable
 * from a page that hung. The layouts normally redirect before a page ever
 * sees this case, so in practice it means the org lookup failed or the
 * membership changed mid-session; either way the user needs words, not a
 * blank.
 */
export interface NoOrgSelectedProps {
  /** What the app calls an org: "community" (HOA), "workspace" (pm, eviction). */
  noun?: string
  /** Where to send the user. Defaults to the app root. */
  href?: string
  className?: string
}

export function NoOrgSelected({ noun = 'community', href = '/', className }: NoOrgSelectedProps) {
  return (
    <div className={className} role="status">
      <EmptyState
        icon={<Building2 className="h-10 w-10" aria-hidden />}
        title={`No ${noun} selected`}
        description={`We couldn’t work out which ${noun} to show. Reload the page, or pick a ${noun} from the menu. If this keeps happening, sign out and back in.`}
        action={
          <a href={href} className="text-sm font-medium underline">
            Go to the home page
          </a>
        }
      />
    </div>
  )
}
