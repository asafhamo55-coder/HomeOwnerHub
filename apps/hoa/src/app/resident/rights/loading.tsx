import { ResidentRouteSkeleton } from '@/components/skeletons/RouteSkeleton'

// BL-099: paints at once while this force-dynamic page renders on the
// server, in the page's own layout so nothing jumps when it streams in.
export default function OwnerRightsLoading() {
  return <ResidentRouteSkeleton title={'Your rights as an owner'} subtitle={'What the law gives you as an owner.'} body="rows" />
}
