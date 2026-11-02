import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { parseJson } from '@/lib/api/parse'
import { zText, zUuid } from '@/lib/api/schemas'
import { checkWrite } from '@/lib/api/db'
import {
  loadPostForActor,
  loadThreadForActor,
  looseAdmin,
  requireBoardActor,
  requireModerator,
  type LooseDb,
} from '@/lib/community-board/server'
import { BOARD_HIDE_REASON_MAX } from '@/lib/community-board/rules'

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('hide_post'), postId: zUuid, reason: zText(BOARD_HIDE_REASON_MAX).optional() }),
  z.object({ action: z.literal('unhide_post'), postId: zUuid }),
  z.object({ action: z.literal('close_thread'), threadId: zUuid }),
  z.object({ action: z.literal('reopen_thread'), threadId: zUuid }),
  z.object({ action: z.literal('dismiss_report'), reportId: zUuid }),
  z.object({ action: z.literal('resolve_report'), reportId: zUuid }),
])

interface ReportRow {
  id: string
  post_id: string
  status: string
}

async function loadReport(admin: LooseDb, orgId: string, reportId: string): Promise<ReportRow> {
  const { data, error } = await admin
    .from('board_post_reports')
    .select('id, post_id, status')
    .eq('id', reportId)
    .eq('organization_id', orgId)
    .maybeSingle()
  checkWrite({ error }, 'community-board.report.load', { orgId })
  if (!data) throw new ApiRouteError('not_found')
  return data as ReportRow
}

// Board moderation: hide or show a post, close or reopen a thread, and settle
// a report. Board and admin only, checked before the body is read.
export const POST = withRoute('community-board.moderate', async (request) => {
  const actor = await requireBoardActor()
  requireModerator(actor)
  const input = await parseJson(request, Body)

  const admin = looseAdmin()
  const now = new Date().toISOString()
  const ctx = { orgId: actor.orgId }

  switch (input.action) {
    case 'hide_post': {
      const post = await loadPostForActor(admin, actor, input.postId)
      const res = await admin
        .from('board_posts')
        .update({ hidden_at: now, hidden_by: actor.userId, hidden_reason: input.reason || null })
        .eq('id', post.id)
      checkWrite(res, 'community-board.hide', { ...ctx, rowId: post.id })
      // Hiding the opening post takes the whole thread off residents' lists.
      if (post.is_opening) {
        const t = await admin.from('board_threads').update({ hidden_at: now, hidden_by: actor.userId }).eq('id', post.thread_id)
        checkWrite(t, 'community-board.hide-thread', { ...ctx, rowId: post.thread_id })
      }
      break
    }
    case 'unhide_post': {
      const post = await loadPostForActor(admin, actor, input.postId)
      const res = await admin
        .from('board_posts')
        .update({ hidden_at: null, hidden_by: null, hidden_reason: null })
        .eq('id', post.id)
      checkWrite(res, 'community-board.unhide', { ...ctx, rowId: post.id })
      if (post.is_opening) {
        const t = await admin.from('board_threads').update({ hidden_at: null, hidden_by: null }).eq('id', post.thread_id)
        checkWrite(t, 'community-board.unhide-thread', { ...ctx, rowId: post.thread_id })
      }
      break
    }
    case 'close_thread':
    case 'reopen_thread': {
      const thread = await loadThreadForActor(admin, actor, input.threadId)
      const closing = input.action === 'close_thread'
      const res = await admin
        .from('board_threads')
        .update(closing ? { closed_at: now, closed_by: actor.userId } : { closed_at: null, closed_by: null })
        .eq('id', thread.id)
      checkWrite(res, 'community-board.close', { ...ctx, rowId: thread.id })
      break
    }
    case 'dismiss_report':
    case 'resolve_report': {
      const report = await loadReport(admin, actor.orgId, input.reportId)
      if (report.status !== 'open') {
        throw new ApiRouteError('conflict', 'This report was already settled.', { reason: 'already_resolved' })
      }
      if (input.action === 'resolve_report') {
        const post = await loadPostForActor(admin, actor, report.post_id)
        const h = await admin
          .from('board_posts')
          .update({ hidden_at: now, hidden_by: actor.userId, hidden_reason: 'Hidden after a report' })
          .eq('id', post.id)
        checkWrite(h, 'community-board.resolve.hide', { ...ctx, rowId: post.id })
        if (post.is_opening) {
          const t = await admin.from('board_threads').update({ hidden_at: now, hidden_by: actor.userId }).eq('id', post.thread_id)
          checkWrite(t, 'community-board.resolve.hide-thread', { ...ctx, rowId: post.thread_id })
        }
      }
      const res = await admin
        .from('board_post_reports')
        .update({
          status: input.action === 'resolve_report' ? 'actioned' : 'dismissed',
          resolved_by: actor.userId,
          resolved_at: now,
        })
        .eq('id', report.id)
        .eq('status', 'open')
      checkWrite(res, 'community-board.report.settle', { ...ctx, rowId: report.id })
      break
    }
  }

  return NextResponse.json({ done: true })
})
