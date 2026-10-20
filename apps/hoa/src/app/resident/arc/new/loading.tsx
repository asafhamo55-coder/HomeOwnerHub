import { ResidentRouteSkeleton } from '@/components/skeletons/RouteSkeleton'

// BL-099: paints at once while this force-dynamic page renders on the
// server, in the page's own layout so nothing jumps when it streams in.
export default function ArcNewLoading() {
  return <ResidentRouteSkeleton title={'New ARC application'} subtitle={'Ask the Architectural Review Committee to approve an exterior change. They respond within 30 days per the Declaration.'} body="form" />
}
