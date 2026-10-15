'use client'

import { ReplyComposer } from '@/components/board-review/ReplyComposer'
import { postViolationReportMessage } from '@/lib/board-review'

export function ReportBoardReplyForm({ reportId }: { reportId: string }) {
  return (
    <ReplyComposer
      residentLabel="reporter"
      onSend={(body, internal) => postViolationReportMessage({ reportId, body, internal })}
    />
  )
}
