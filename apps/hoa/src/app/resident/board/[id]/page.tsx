import { notFound } from 'next/navigation'
import { BoardThreadScreen } from '@/components/community-board/BoardScreens'
import { postLimitFromParam } from '@/lib/community-board/rules'

export const metadata = { title: 'Community board' }
export const dynamic = 'force-dynamic'

export default async function ResidentBoardThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ replies?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  return <BoardThreadScreen basePath="/resident/board" threadId={id} postLimit={postLimitFromParam(sp.replies)} />
}
