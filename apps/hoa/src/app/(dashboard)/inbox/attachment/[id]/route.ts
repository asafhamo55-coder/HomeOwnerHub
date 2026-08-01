import { NextResponse } from 'next/server'
// The SHARED helper, not a fourth private copy (amended post-review —
// final branch review, Fix 6). Imported via the `./db-error` subpath, not
// the package root: `@homeowner-portal/jobs` resolves to src/index.ts,
// which pulls in every Inngest function definition (plus plaid, ai and
// workflows) — none of which belongs in an app route. src/db-error.ts has
// ZERO imports of its own, so this subpath drags in nothing but the
// function itself. Same shape as the existing
// `@homeowner-portal/jobs/mailbox-tokens` subpath.
//
// The remaining private copies in lib/inbox/match.ts and lib/inbox/
// ingest.ts are NOT redundant and must stay: those two files are imported
// by packages/jobs over a relative path and may not carry any runtime
// import at all (see the header comment on each).
import { logDbError } from '@homeowner-portal/jobs/db-error'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const BUCKET = 'hoa-documents'
const SIGNED_URL_TTL_SECONDS = 60

/**
 * Attachment download.
 *
 * Three gates, fail closed on every one:
 *   1. requireBoardOrAdmin() — role gate. Redirects (never falls through)
 *      if there's no session or the caller is a resident.
 *   2. The row is read through the USER-bound client, so RLS on
 *      inbox_attachments (board_access, 0029_inbox.sql) applies too, and
 *      is additionally scoped to the caller's active org explicitly below
 *      so a cross-org id can't even be attempted.
 *   3. Only once both checks pass does this mint a short-lived signed URL
 *      for the private bucket.
 *
 * A failed metadata read is NOT treated as "not found" — that would let a
 * transient PostgREST error look identical to "this attachment doesn't
 * exist," which is the wrong failure mode for a security-relevant check.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  const { org } = await requireBoardOrAdmin()

  const supabase = await getSupabaseServerClient()
  const { data: attachment, error } = await supabase
    .from('inbox_attachments')
    .select('storage_path, file_name, fetch_status')
    .eq('id', id)
    .eq('organization_id', org.id)
    .maybeSingle()

  if (error) {
    logDbError('inbox attachment download', 'inbox_attachments', { attachmentId: id }, error)
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
  }

  if (!attachment) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (attachment.fetch_status !== 'stored' || !attachment.storage_path) {
    return NextResponse.json(
      { error: 'not_available', status: attachment.fetch_status },
      { status: 409 },
    )
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(attachment.storage_path, SIGNED_URL_TTL_SECONDS, {
      download: attachment.file_name,
    })

  if (signError || !signed) {
    if (signError) {
      // StorageError, not PostgrestError — no `.code` to rely on, and
      // `.message` alone is safe (never an email/subject/body).
      console.error('inbox attachment download: signing failed', {
        attachmentId: id,
        message: signError.message,
      })
    }
    return NextResponse.json({ error: 'signing_failed' }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}
