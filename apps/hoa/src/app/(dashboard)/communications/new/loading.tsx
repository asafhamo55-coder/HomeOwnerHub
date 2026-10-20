import { BoardRouteSkeleton } from '@/components/skeletons/RouteSkeleton'

// BL-099: paints at once while this force-dynamic page renders on the
// server, in the page's own layout so nothing jumps when it streams in.
export default function CommunicationsNewLoading() {
  return <BoardRouteSkeleton title={'New message'} width="narrow" body="form" />
}
