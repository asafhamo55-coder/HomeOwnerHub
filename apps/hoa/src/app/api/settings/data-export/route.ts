import { NextResponse } from 'next/server'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { EXPORT_TABLES } from '@/lib/data-export/tables'
import { exportZipStream, type ExportClient } from '@/lib/data-export/zip'
import { getSupabaseServerClient } from '@/lib/supabase/server'

/**
 * GET /api/settings/data-export — BL-011 "Download all data".
 *
 * Board/admin only. Streams a zip with one CSV per domain; nothing is
 * stored server-side. Reads use the caller's RLS-scoped client (never the
 * service role), so 0063's policies apply on top of the role gate.
 *
 * One audit_log row per export, written as the caller BEFORE any data is
 * read. If it cannot be written the export is refused: bulk PII does not
 * leave without a record.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) {
    return NextResponse.json({ error: 'forbidden', message: gate.error }, { status: 403 })
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { error: auditError } = await supabase.from('audit_log').insert({
    action: 'data_export',
    org_id: gate.orgId,
    user_id: user.id,
    entity_type: 'org',
    entity_id: gate.orgId,
    metadata: { files: EXPORT_TABLES.map((t) => t.file) },
  })
  if (auditError) {
    console.error('[data-export] audit insert failed', { orgId: gate.orgId, code: auditError.code ?? null })
    return NextResponse.json(
      { error: 'audit_failed', message: 'The export could not be recorded, so it was not started. Try again.' },
      { status: 500 },
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  return new Response(exportZipStream(supabase as unknown as ExportClient, gate.orgId), {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="association-data-${today}.zip"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}
