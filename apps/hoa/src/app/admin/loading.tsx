import { PageSkeleton } from '@homeowner-portal/ui'

// Route-level loading state for /admin/*. Same skeleton as every other
// shell; `wide` because most platform pages are dashboards or wide tables.
export default function AdminLoading() {
  return <PageSkeleton width="wide" />
}
