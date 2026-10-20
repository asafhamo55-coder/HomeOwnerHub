import { BoardRouteSkeleton } from '@/components/skeletons/RouteSkeleton'

// BL-121: paints at once while this force-dynamic page renders on the server.
export default function AccountingReportsYearEndLoading() {
  return <BoardRouteSkeleton title={'Year-end package'} kpis={3} body="cards" />
}
