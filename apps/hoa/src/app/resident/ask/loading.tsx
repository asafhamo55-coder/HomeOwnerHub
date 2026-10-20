import { ResidentRouteSkeleton } from '@/components/skeletons/RouteSkeleton'

// BL-099: paints at once while this force-dynamic page renders on the
// server, in the page's own layout so nothing jumps when it streams in.
export default function AskLoading() {
  return <ResidentRouteSkeleton title={'Ask the Docs'} subtitle={'Ask about your community\'s governing documents. Every answer cites its section — and if the docs don\'t cover it, you\'ll be told so rather than given a guess.'} body="form" />
}
