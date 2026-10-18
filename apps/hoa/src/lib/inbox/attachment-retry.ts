'use server'

/**
 * BL-017 — board-only "Retry" for an inbox attachment that failed to
 * download.
 *
 * Gate first: requireBoardOrAdmin() runs before any Supabase client is
 * created, so a resident posting at this action never reaches the
 * database (RLS's board_access policy on inbox_attachments is the
 * backstop, not the gate).
 *
 * Retrying resets `fetch_attempts` to 0 and the row to 'pending', then
 * sends the existing `mailbox/attachments.queued` event so the fetch job
 * runs now rather than at the next 5-minute cron tick. The update is
 * conditional on the row still being 'failed', so a double click or a
 * concurrent retry flips it once.
 *
 * Logs carry ids and Postgres codes only — never a file name, which is
 * resident-supplied text.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { inngest } from '@homeowner-portal/jobs'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { isRetryableFetchError } from './attachment-state'

export interface RetryAttachmentState {
  ok?: boolean
  error?: string
}

export async function retryAttachment(
  _prev: RetryAttachmentState,
  formData: FormData,
): Promise<RetryAttachmentState> {
  const { org } = await requireBoardOrAdmin()

  const parsed = z.string().uuid().safeParse(formData.get('attachmentId'))
  if (!parsed.success) return { error: 'Invalid attachment.' }
  const attachmentId = parsed.data

  const supabase = await getSupabaseServerClient()

  const { data: row, error: readError } = await supabase
    .from('inbox_attachments')
    .select('id, thread_id, fetch_status, fetch_error')
    .eq('id', attachmentId)
    .eq('organization_id', org.id)
    .maybeSingle()

  if (readError) {
    console.error('retryAttachment: read failed', {
      orgId: org.id,
      attachmentId,
      code: readError.code,
    })
    return { error: 'Could not retry this attachment. Try again.' }
  }
  if (!row) return { error: 'Attachment not found.' }

  // Already re-queued (double click) or already stored: nothing to do.
  if (row.fetch_status !== 'failed') return { ok: true }

  if (!isRetryableFetchError(row.fetch_error)) {
    return { error: 'This file can’t be downloaded again here — open it in Gmail.' }
  }

  const { error: updateError } = await supabase
    .from('inbox_attachments')
    .update({ fetch_status: 'pending', fetch_attempts: 0, fetch_error: null })
    .eq('id', attachmentId)
    .eq('organization_id', org.id)
    .eq('fetch_status', 'failed')
    .select('id')
    .maybeSingle()

  if (updateError) {
    console.error('retryAttachment: update failed', {
      orgId: org.id,
      attachmentId,
      code: updateError.code,
    })
    return { error: 'Could not retry this attachment. Try again.' }
  }

  try {
    await inngest.send({
      name: 'mailbox/attachments.queued',
      data: { organizationId: org.id, attachmentId },
    })
  } catch (error) {
    // Not fatal: the row is 'pending' with a fresh budget, and the job's
    // 5-minute cron picks it up regardless. Logged so a broken event key
    // is visible.
    console.error('retryAttachment: could not send mailbox/attachments.queued', {
      orgId: org.id,
      attachmentId,
      message: error instanceof Error ? error.message : String(error),
    })
  }

  revalidatePath(`/inbox/${row.thread_id}`)
  return { ok: true }
}
