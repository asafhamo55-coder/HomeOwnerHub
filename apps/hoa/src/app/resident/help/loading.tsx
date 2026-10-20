import { ResidentRouteSkeleton } from '@/components/skeletons/RouteSkeleton'

// BL-099: paints at once while this force-dynamic page renders on the
// server, in the page's own layout so nothing jumps when it streams in.
export default function HelpLoading() {
  return <ResidentRouteSkeleton title={'Help'} subtitle={'Step-by-step help for your resident portal.'} body="rows" />
}
