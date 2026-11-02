import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { parseJson } from '@/lib/api/parse'
import { zText, zUuid } from '@/lib/api/schemas'
import { checkWrite } from '@/lib/api/db'
import { logRouteFailure } from '@/lib/api/log'
import { displayLabel, loadThreadForActor, looseAdmin, requireBoardActor } from '@/lib/community-board/server'
import { BOARD_BODY_MAX, cleanBoardText, isBoardModerator, replyRefusal } from '@/lib/community-board/rules'

const Body = z.object({
  threadId: zUuid,
  body: zText(BOARD_BODY_MAX, 1),
})

// A reply. Residents reply in their own community's open threads; the board
// can also answer in a closed one.
export const POST = withRoute('community-board.reply', async (request) => {
  const actor = await requireBoardActor()
  const input = await parseJson(request, Body)

  const admin = looseAdmin()
  const thread = await loadThreadForActor(admin, actor, input.threadId)
  const refusal = replyRefusal(actor.role, thread)
  if (refusal === 'thread_closed') {
    throw new ApiRouteError('unprocessable', 'This thread is closed. Please start a new one.', { reason: 'thread_closed' })
  }
  if (refusal) throw new ApiRouteError('not_found')

  const label = await displayLabel(admin, actor.userId)
  const inserted = await admin
    .from('board_posts')
    .insert({
      organization_id: actor.orgId,
      association_id: thread.association_id,
      thread_id: thread.id,
      author_id: actor.userId,
      author_label: label,
      author_is_board: isBoardModerator(actor.role),
      is_opening: false,
      body: cleanBoardText(input.body),
    })
    .select('id')
    .single()
  checkWrite({ error: inserted.error }, 'community-board.reply.insert', { orgId: actor.orgId, rowId: thread.id })

  // Bump the thread to the top of the list. A failure here only leaves the
  // order stale, so it is logged and the reply still succeeds.
  const bump = await admin
    .from('board_threads')
    .update({ last_activity_at: new Date().toISOString() })
    .eq('id', thread.id)
  if (bump.error) logRouteFailure('community-board.reply.bump', bump.error, { orgId: actor.orgId, rowId: thread.id })

  return NextResponse.json({ postId: (inserted.data as { id: string } | null)?.id ?? null }, { status: 201 })
})
