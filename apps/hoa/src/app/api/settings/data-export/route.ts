import { withRoute } from '@/lib/api/handler'
import { requireRouteBoardOrAdmin, requireRouteUser } from '@/lib/api/auth'
import { checkWrite } from '@/lib/api/db'
import { EXPORT_TABLES } from '@/lib/data-export/tables'
import { exportZipStream, type ExportClient } from '@/lib/data-export/zip'
import { getSupabaseServerClient } from '@/lib/supabase/server'

/**
 * GET /api/settings/data-export — BL-011 "Download all data".
 *
 * Board/admin only (RC-4): a resident gets 403, no org 403 no_org, no
 * session 401 — all as the RC-1 envelope. Streams a zip with one CSV per
 * domain; nothing is stored server-side. Reads use the caller's RLS-scoped
 * client (never the service role), so 0063's policies apply on top of the
 * role gate. Every table is read in full via range paging (RC-9, see
 * lib/data-export/zip.ts).
 *
 * One audit_log row per export, written as the caller BEFORE any data is
 * read. If it cannot be written the export is refused with a generic 500
 * (RC-6): bulk PII does not leave without a record.
 *
 * Takes no body or query, so there is nothing to parse (RC-3 steps 4-5).
 * A read failing mid-stream cannot change the already-sent 200; the zip
 * stream errors instead, so the client never saves a partial archive.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = withRoute('settings.data-export', async () => {
  const { orgId } = await requireRouteBoardOrAdmin()
  const { userId } = await requireRouteUser()

  const supabase = await getSupabaseServerClient()
  const { error: auditError } = await supabase.from('audit_log').insert({
    action: 'data_export',
    org_id: orgId,
    user_id: userId,
    entity_type: 'org',
    entity_id: orgId,
    metadata: { files: EXPORT_TABLES.map((t) => t.file) },
  })
  checkWrite({ error: auditError }, 'settings.data-export.audit', { orgId })

  const today = new Date().toISOString().slice(0, 10)
  return new Response(exportZipStream(supabase as unknown as ExportClient, orgId), {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="association-data-${today}.zip"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
})
