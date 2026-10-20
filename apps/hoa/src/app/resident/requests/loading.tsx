import { ResidentRouteSkeleton } from '@/components/skeletons/RouteSkeleton'

// BL-099: paints at once while this force-dynamic page renders on the
// server, in the page's own layout so nothing jumps when it streams in.
export default function RequestsLoading() {
  return <ResidentRouteSkeleton title={'Requests'} subtitle={'Start something new, or track what you\'ve already sent your board.'} body="rows" />
}
