import { PageSkeleton } from '@homeowner-portal/ui'

// One loading state for every page in this shell. Pages here render on
// the server per request; without this a slow query left the previous
// page frozen with no sign anything was happening.
export default function DashboardLoading() {
  return <PageSkeleton />
}
