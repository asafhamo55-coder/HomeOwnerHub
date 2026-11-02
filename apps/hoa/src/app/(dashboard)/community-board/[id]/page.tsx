import { notFound } from 'next/navigation'
import { BoardThreadScreen } from '@/components/community-board/BoardScreens'

export const metadata = { title: 'Community board' }
export const dynamic = 'force-dynamic'

export default async function CommunityBoardThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  return <BoardThreadScreen basePath="/community-board" threadId={id} />
}
