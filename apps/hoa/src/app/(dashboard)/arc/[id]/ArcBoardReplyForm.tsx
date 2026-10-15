'use client'

import { ReplyComposer } from '@/components/board-review/ReplyComposer'
import { postArcMessage } from '@/lib/board-review'

export function ArcBoardReplyForm({ arcId }: { arcId: string }) {
  return <ReplyComposer residentLabel="resident" onSend={(body, internal) => postArcMessage({ arcId, body, internal })} />
}
