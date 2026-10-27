import { BoardRouteSkeleton } from '@/components/skeletons/RouteSkeleton'

// Paints at once while this force-dynamic page renders on the server.
export default function FinancialPacketLoading() {
  return <BoardRouteSkeleton title={'3-year financial packet'} body="table" />
}
