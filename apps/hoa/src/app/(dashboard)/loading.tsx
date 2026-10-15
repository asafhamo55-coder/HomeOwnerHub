import { PageSkeleton } from '@homeowner-portal/ui'

// One loading state for every board page. Every page here is force-dynamic
// server rendering; before this, a hard load or slow query showed the
// previous page frozen (NavigationProgress only covers soft navigation).
// Generic on purpose — see PageSkeleton.
export default function DashboardLoading() {
  return <PageSkeleton />
}
