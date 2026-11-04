import { enforceBoardRate } from '@/lib/community-board/rate-limit'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireOrgOwned } from '@/lib/api/auth'
import { parseJson } from '@/lib/api/parse'
import { zText, zUuid } from '@/lib/api/schemas'
import { checkWrite } from '@/lib/api/db'
import { logRouteFailure } from '@/lib/api/log'
import {
  displayLabel,
  looseAdmin,
  requireAssociationAccess,
  requireBoardActor,
} from '@/lib/community-board/server'
import {
  BOARD_BODY_MAX,
  BOARD_TITLE_MAX,
  BOARD_TITLE_MIN,
  cleanBoardText,
  isBoardModerator,
} from '@/lib/community-board/rules'

const Body = z.object({
  associationId: zUuid,
  title: zText(BOARD_TITLE_MAX, BOARD_TITLE_MIN),
  body: zText(BOARD_BODY_MAX, 1),
})

// Residents start threads in their own community; the board in any association
// of the organization. Writes use the service role after the checks below.
export const POST = withRoute('community-board.thread-create', async (request) => {
  const actor = await requireBoardActor()
  const input = await parseJson(request, Body)
  if (isBoardModerator(actor.role)) {
    await requireOrgOwned('associations', input.associationId, actor.orgId)
  }
  requireAssociationAccess(actor, input.associationId)

  const admin = looseAdmin()
  await enforceBoardRate(admin, 'thread', { orgId: actor.orgId, userId: actor.userId })
  const label = await displayLabel(admin, actor.userId)
  const now = new Date().toISOString()

  const thread = await admin
    .from('board_threads')
    .insert({
      organization_id: actor.orgId,
      association_id: input.associationId,
      title: input.title,
      created_by: actor.userId,
      last_activity_at: now,
    })
    .select('id')
    .single()
  checkWrite({ error: thread.error }, 'community-board.thread.insert', { orgId: actor.orgId })
  const threadId = (thread.data as { id: string } | null)?.id
  if (!threadId) throw new ApiRouteError('internal')

  const post = await admin.from('board_posts').insert({
    organization_id: actor.orgId,
    association_id: input.associationId,
    thread_id: threadId,
    author_id: actor.userId,
    author_label: label,
    author_is_board: isBoardModerator(actor.role),
    is_opening: true,
    body: cleanBoardText(input.body),
  })
  if (post.error) {
    // Compensate: no thread without its opening post.
    const undo = await admin.from('board_threads').delete().eq('id', threadId)
    if (undo.error) logRouteFailure('community-board.thread.undo', undo.error, { orgId: actor.orgId, rowId: threadId })
    checkWrite({ error: post.error }, 'community-board.thread.post', { orgId: actor.orgId })
  }

  return NextResponse.json({ threadId }, { status: 201 })
})
