import { BoardRouteSkeleton } from '@/components/skeletons/RouteSkeleton'

// BL-099: paints at once while this force-dynamic page renders on the server.
export default function GaRegistrationLoading() {
  return <BoardRouteSkeleton title={'Georgia registration kit'} width="default" body="cards" />
}
