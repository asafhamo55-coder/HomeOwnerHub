import { ResidentRouteSkeleton } from '@/components/skeletons/RouteSkeleton'

// BL-099: paints at once while this force-dynamic page renders on the
// server, in the page's own layout so nothing jumps when it streams in.
export default function TicketsNewLoading() {
  return <ResidentRouteSkeleton title={'New support request'} subtitle={'Tell the board what\'s going on. You\'ll get replies right here.'} body="form" />
}
