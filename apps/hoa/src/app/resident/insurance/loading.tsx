import { ResidentRouteSkeleton } from '@/components/skeletons/RouteSkeleton'

// BL-099: paints at once while this force-dynamic page renders on the
// server, in the page's own layout so nothing jumps when it streams in.
export default function InsuranceLoading() {
  return <ResidentRouteSkeleton title={'Insurance'} subtitle={'What the association insures, with whom, and for how much.'} body="rows" />
}
