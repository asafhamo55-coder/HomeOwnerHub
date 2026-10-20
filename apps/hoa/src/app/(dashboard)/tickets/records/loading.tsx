import { BoardRouteSkeleton } from '@/components/skeletons/RouteSkeleton'

// Paints at once while this force-dynamic page renders on the server.
export default function RecordsRequestsLoading() {
  return <BoardRouteSkeleton title={'Records requests'} body="table" />
}
