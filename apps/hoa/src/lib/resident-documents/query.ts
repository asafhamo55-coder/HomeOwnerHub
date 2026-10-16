/**
 * Reads for the resident documents screen (BL-049).
 *
 * Always called with the signed-in user's OWN client (RLS-bound), never
 * service role: 0063 lets org members SELECT hoa_documents,
 * hoa_document_versions and governing_documents (pre-0063 the FOR ALL
 * org_access policies allow the same SELECT), and the storage SELECT
 * policies from 0055/0056 let them read their org's objects in
 * hoa-documents and governing-docs. RLS cannot tell a resident-facing
 * document from a board-only one, so the allowlist in visibility.ts is
 * applied twice — in the query (`.in('type', …)`) and again on the rows.
 *
 * Every read throws on error (code only, never row values) so the page
 * shows "Couldn't load" rather than a falsely empty list.
 *
 * No 'use server' and no Next imports: tests/integration imports this.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import type { ResidentDocument } from './group'
import {
  DOCUMENT_BUCKET,
  RESIDENT_VISIBLE_TYPES,
  canResidentOpen,
  isResidentVisible,
  type DocSource,
} from './visibility'

type Client = SupabaseClient<Database>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseDocSource(value: string): DocSource | null {
  return value === 'hoa' || value === 'governing' ? value : null
}

export function isUuid(value: string): boolean {
  return UUID.test(value)
}

/** Current, resident-visible documents of one org, both tables. */
export async function fetchResidentDocuments(client: Client, orgId: string): Promise<ResidentDocument[]> {
  const [hoa, gov] = await Promise.all([
    client
      .from('hoa_documents')
      .select('id, name, type, storage_path, created_at')
      .eq('org_id', orgId)
      .in('type', [...RESIDENT_VISIBLE_TYPES.hoa]),
    client
      .from('governing_documents')
      .select('id, title, type, effective_date, storage_path, ai_generated, created_at, updated_at')
      .eq('organization_id', orgId)
      .is('superseded_at', null)
      .in('type', [...RESIDENT_VISIBLE_TYPES.governing]),
  ])
  if (hoa.error) throw new Error(`hoa_documents: ${hoa.error.code ?? 'error'}`)
  if (gov.error) throw new Error(`governing_documents: ${gov.error.code ?? 'error'}`)

  const hoaRows = (hoa.data ?? []).filter((d) => isResidentVisible({ source: 'hoa', type: d.type }))

  // When each hoa document's file was last replaced: the newest version
  // row is the snapshot taken at that replacement.
  const replacedAt = new Map<string, string>()
  if (hoaRows.length > 0) {
    const versions = await client
      .from('hoa_document_versions')
      .select('document_id, created_at')
      .in(
        'document_id',
        hoaRows.map((d) => d.id),
      )
    if (versions.error) throw new Error(`hoa_document_versions: ${versions.error.code ?? 'error'}`)
    for (const v of versions.data ?? []) {
      const prev = replacedAt.get(v.document_id)
      if (!prev || Date.parse(v.created_at) > Date.parse(prev)) replacedAt.set(v.document_id, v.created_at)
    }
  }

  const out: ResidentDocument[] = hoaRows.map((d) => ({
    source: 'hoa',
    id: d.id,
    title: d.name,
    type: d.type,
    effectiveDate: null,
    addedAt: d.created_at,
    updatedAt: replacedAt.get(d.id) ?? null,
    hasFile: Boolean(d.storage_path?.trim()),
  }))
  for (const d of gov.data ?? []) {
    if (!isResidentVisible({ source: 'governing', type: d.type, aiGenerated: d.ai_generated })) continue
    out.push({
      source: 'governing',
      id: d.id,
      title: d.title,
      type: d.type,
      effectiveDate: d.effective_date,
      addedAt: d.created_at,
      updatedAt: null,
      hasFile: Boolean(d.storage_path?.trim()),
      aiGenerated: d.ai_generated,
    })
  }
  return out
}

export interface OpenTarget {
  bucket: string
  path: string
}

/**
 * The storage object a resident may open for one document, or null when
 * the document does not exist in this org, is not resident-visible, or has
 * no file. The three are deliberately indistinguishable to the caller.
 */
export async function fetchResidentDocumentFile(
  client: Client,
  orgId: string,
  source: DocSource,
  id: string,
): Promise<OpenTarget | null> {
  if (!isUuid(id)) return null
  if (source === 'hoa') {
    const { data, error } = await client
      .from('hoa_documents')
      .select('type, storage_path')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (error) throw new Error(`hoa_documents: ${error.code ?? 'error'}`)
    if (!data || !canResidentOpen({ source, type: data.type, storagePath: data.storage_path })) return null
    return { bucket: DOCUMENT_BUCKET.hoa, path: data.storage_path }
  }
  const { data, error } = await client
    .from('governing_documents')
    .select('type, storage_path, ai_generated, superseded_at')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new Error(`governing_documents: ${error.code ?? 'error'}`)
  if (
    !data ||
    !data.storage_path ||
    !canResidentOpen({
      source,
      type: data.type,
      aiGenerated: data.ai_generated,
      superseded: data.superseded_at != null,
      storagePath: data.storage_path,
    })
  ) {
    return null
  }
  return { bucket: DOCUMENT_BUCKET.governing, path: data.storage_path }
}

/** Signed-URL lifetime: the route redirects to it immediately. */
export const SIGNED_URL_SECONDS = 60
