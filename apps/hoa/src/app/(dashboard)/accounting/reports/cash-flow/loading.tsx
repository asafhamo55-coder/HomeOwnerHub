import { BoardRouteSkeleton } from '@/components/skeletons/RouteSkeleton'

// BL-099: paints at once while this force-dynamic page renders on the
// server, in the page's own layout so nothing jumps when it streams in.
export default function AccountingReportsCashFlowLoading() {
  return <BoardRouteSkeleton title={'Cash flow'} kpis={3} body="cards" />
}
