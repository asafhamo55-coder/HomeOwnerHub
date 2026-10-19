'use server'

/**
 * BL-052: the board posts a document to owners (hoa_documents /
 * governing_documents.visible_to_owners, migration 0064). The allowlisted
 * types (hoa: ccr / bylaws / rules; governing: declaration / bylaws /
 * rules / amendment / policy) are always visible to owners and are not
 * switchable — see lib/resident-documents/visibility.ts.
 *
 * Inert until M1_APPLIED: the column does not exist before 0064.
 */
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { M1_APPLIED } from '@homeowner-portal/db/m1'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { RESIDENT_VISIBLE_TYPES, type DocSource } from '@/lib/resident-documents/visibility'

export type VisibilityResult = { ok: true } | { ok: false; error: string }

const Input = z.object({
  documentId: z.string().uuid(),
  visible: z.boolean(),
  source: z.enum(['hoa', 'governing']),
})

// Both tables have id / type / visible_to_owners; only the org column's
// name differs. Typed as hoa_documents for the shared builder chain.
const TABLE: Record<DocSource, { table: 'hoa_documents'; org: 'org_id' }> = {
  hoa: { table: 'hoa_documents', org: 'org_id' },
  governing: { table: 'governing_documents' as 'hoa_documents', org: 'organization_id' as 'org_id' },
}

export async function setDocumentVisibleToOwners(
  documentId: string,
  visible: boolean,
  source: DocSource = 'hoa',
): Promise<VisibilityResult> {
  if (!M1_APPLIED) return { ok: false, error: 'Sharing documents with owners isn’t available yet.' }
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = Input.safeParse({ documentId, visible, source })
  if (!parsed.success) return { ok: false, error: 'Invalid request.' }
  const t = TABLE[parsed.data.source]

  const supabase = await getSupabaseServerClient()
  const { data: doc, error: readErr } = await supabase
    .from(t.table)
    .select('id, type')
    .eq('id', parsed.data.documentId)
    .eq(t.org, gate.orgId)
    .maybeSingle()
  if (readErr) return { ok: false, error: 'Couldn’t save. Try again.' }
  if (!doc) return { ok: false, error: 'Document not found.' }
  if (RESIDENT_VISIBLE_TYPES[parsed.data.source].includes((doc as { type: string }).type)) {
    return { ok: false, error: 'Governing documents and rules are always visible to owners.' }
  }

  const { data, error } = await supabase
    .from(t.table)
    .update({ visible_to_owners: parsed.data.visible })
    .eq('id', parsed.data.documentId)
    .eq(t.org, gate.orgId)
    .select('id')
  if (error) return { ok: false, error: 'Couldn’t save. Try again.' }
  if (!data || data.length === 0) return { ok: false, error: 'Document not found.' }

  if (parsed.data.source === 'hoa') {
    revalidatePath('/documents')
    revalidatePath(`/documents/${parsed.data.documentId}`)
  } else {
    revalidatePath('/documents/governing')
  }
  revalidatePath('/resident/documents')
  return { ok: true }
}
