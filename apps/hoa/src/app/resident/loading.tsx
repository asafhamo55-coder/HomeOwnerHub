import { PageSkeleton } from '@homeowner-portal/ui'

// One loading state for every resident page. Renders inside the resident
// layout's centred column, so the top bar and tab bar stay put.
export default function ResidentLoading() {
  return <PageSkeleton width="narrow" />
}
