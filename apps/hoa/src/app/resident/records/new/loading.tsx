import { ResidentRouteSkeleton } from '@/components/skeletons/RouteSkeleton'

// Paints at once while this force-dynamic page renders on the server.
export default function RecordsNewLoading() {
  return <ResidentRouteSkeleton title={'Request association records'} body="form" />
}
