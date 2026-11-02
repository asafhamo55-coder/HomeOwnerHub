import { BoardHomeScreen } from '@/components/community-board/BoardScreens'

export const metadata = { title: 'Community board' }
export const dynamic = 'force-dynamic'

export default async function CommunityBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; page?: string }>
}) {
  const sp = await searchParams
  const page = Math.max(1, Math.min(1000, Number.parseInt(sp.page ?? '1', 10) || 1))
  return <BoardHomeScreen basePath="/community-board" association={sp.a} page={page} />
}
