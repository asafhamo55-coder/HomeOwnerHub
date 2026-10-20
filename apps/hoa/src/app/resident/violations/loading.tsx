import { ResidentRouteSkeleton } from '@/components/skeletons/RouteSkeleton'

// BL-099: paints at once while this force-dynamic page renders on the
// server, in the page's own layout so nothing jumps when it streams in.
export default function ViolationsLoading() {
  return <ResidentRouteSkeleton title={'Reported concerns'} subtitle={'Concerns you\'ve reported and what the board decided.'} body="rows" />
}
