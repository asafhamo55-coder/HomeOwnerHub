import { PageSkeleton } from '@homeowner-portal/ui'

// One loading state for every professionals-portal page: the same generic
// skeleton the board dashboard uses, so a slow load never shows a blank
// screen to an outside CPA or attorney.
export default function ProLoading() {
  return <PageSkeleton />
}
