/**
 * BL-134 (inbox plan B5) — document provenance: which inbox attachment a
 * library document was filed from (hoa_documents.source_inbox_attachment_id,
 * migration 0067; written by attachment-file.ts once M3_APPLIED).
 *
 *   filedAttachmentDocuments  thread view: attachment id → document id, so
 *                             a filed attachment shows "Filed to library"
 *   documentEmailSource       document page: the thread to link back to
 *
 * Inert until M3_APPLIED (no query; the column may not exist). Board RLS
 * client only: inbox_attachments is board/admin-only (0029), so a
 * non-board reader never resolves a thread. A failed read is logged by
 * code and treated as "no provenance": enrichment, never page-defining.
 */

import { M3_APPLIED } from '@homeowner-portal/db/m3'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDb = { from: (table: string) => any }

const CHUNK = 200

export async function filedAttachmentDocuments(
  db: LooseDb,
  orgId: string,
  attachmentIds: readonly string[],
  live: boolean = M3_APPLIED,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!live || attachmentIds.length === 0) return out
  for (let i = 0; i < attachmentIds.length; i += CHUNK) {
    const { data, error } = (await db
      .from('hoa_documents')
      .select('id, source_inbox_attachment_id')
      .eq('org_id', orgId)
      .in('source_inbox_attachment_id', attachmentIds.slice(i, i + CHUNK))) as {
      data: Array<{ id: string; source_inbox_attachment_id: string | null }> | null
      error: { code?: string } | null
    }
    if (error) {
      console.error('filedAttachmentDocuments: read failed', { orgId, code: error.code ?? null })
      return out
    }
    for (const row of data ?? []) {
      if (row.source_inbox_attachment_id && !out.has(row.source_inbox_attachment_id)) {
        out.set(row.source_inbox_attachment_id, row.id)
      }
    }
  }
  return out
}

export interface DocumentEmailSource {
  threadId: string
  /** When the attachment was stored, if known. */
  receivedAt: string | null
}

export async function documentEmailSource(
  db: LooseDb,
  orgId: string,
  documentId: string,
  live: boolean = M3_APPLIED,
): Promise<DocumentEmailSource | null> {
  if (!live) return null
  const { data: doc, error: docError } = (await db
    .from('hoa_documents')
    .select('source_inbox_attachment_id')
    .eq('org_id', orgId)
    .eq('id', documentId)
    .maybeSingle()) as { data: { source_inbox_attachment_id: string | null } | null; error: { code?: string } | null }
  if (docError) {
    console.error('documentEmailSource: document read failed', { orgId, documentId, code: docError.code ?? null })
    return null
  }
  const attachmentId = doc?.source_inbox_attachment_id
  if (!attachmentId) return null
  const { data: att, error: attError } = (await db
    .from('inbox_attachments')
    .select('thread_id, created_at')
    .eq('organization_id', orgId)
    .eq('id', attachmentId)
    .maybeSingle()) as { data: { thread_id: string; created_at: string | null } | null; error: { code?: string } | null }
  if (attError) {
    console.error('documentEmailSource: attachment read failed', { orgId, documentId, code: attError.code ?? null })
    return null
  }
  return att ? { threadId: att.thread_id, receivedAt: att.created_at ?? null } : null
}
