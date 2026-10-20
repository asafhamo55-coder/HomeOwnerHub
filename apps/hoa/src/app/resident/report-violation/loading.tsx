import { ResidentRouteSkeleton } from '@/components/skeletons/RouteSkeleton'

// BL-099: paints at once while this force-dynamic page renders on the
// server, in the page's own layout so nothing jumps when it streams in.
export default function ReportViolationLoading() {
  return <ResidentRouteSkeleton title={'Report a concern'} subtitle={'Tell the board about a possible rule violation or community issue. They\'ll review it and decide whether to act.'} body="form" />
}
