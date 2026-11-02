import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withRoute } from '@/lib/api/handler'
import { parseJson } from '@/lib/api/parse'
import { zText, zUuid } from '@/lib/api/schemas'
import { checkWrite } from '@/lib/api/db'
import { loadPostForActor, looseAdmin, requireBoardActor } from '@/lib/community-board/server'
import { BOARD_REPORT_MAX, cleanBoardText } from '@/lib/community-board/rules'

const Body = z.object({
  postId: zUuid,
  reason: zText(BOARD_REPORT_MAX, 1),
})

// "Report this post". Any member who can see the post may report it, once.
// The report goes to the board's queue; nothing is emailed.
export const POST = withRoute('community-board.report', async (request) => {
  const actor = await requireBoardActor()
  const input = await parseJson(request, Body)

  const admin = looseAdmin()
  const post = await loadPostForActor(admin, actor, input.postId)

  const inserted = await admin.from('board_post_reports').insert({
    organization_id: actor.orgId,
    association_id: post.association_id,
    post_id: post.id,
    reported_by: actor.userId,
    reason: cleanBoardText(input.reason),
  })
  checkWrite({ error: inserted.error }, 'community-board.report.insert', { orgId: actor.orgId, rowId: post.id }, {
    conflict: { reason: 'already_reported', message: 'You already reported this post. The board will look at it.' },
  })

  return NextResponse.json({ reported: true }, { status: 201 })
})
