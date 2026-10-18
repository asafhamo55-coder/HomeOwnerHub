/**
 * Reads for the resident documents screen (BL-049).
 *
 * Always called with the signed-in user's OWN client (RLS-bound), never
 * service role. 0063 already limits a resident's SELECT to the allowlisted
 * types; 0064 (M1) adds the board-set visible_to_owners flag to that rule
 * and makes storage reads follow it. The app applies the same rule twice
 * anyway — in the query and again on the rows — so it is right on a
 * database without 0063/0064 too. With M1_APPLIED false the flag is never
 * read (the query names no M1 column), which is correct on either schema.
 *
 * Every read throws on error (code only, never row values) so the page
 * shows "Couldn't load" rather than a falsely empty list.
 *
 * No 'use server' and no Next imports: tests/integration imports this.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { M1_APPLIED } from '@homeowner-portal/db/m1'
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

/** `m1`: read the board-set visible_to_owners flag (0064). Defaults to M1_APPLIED. */
export interface VisibilityOptions {
  m1?: boolean
}

/**
 * PostgREST `or` filter: an allowlisted type, or posted by the board.
 * Values are fixed identifiers from visibility.ts, never user input.
 */
export function residentVisibleOrFilter(source: DocSource): string {
  return `type.in.(${RESIDENT_VISIBLE_TYPES[source].join(',')}),visible_to_owners.is.true`
}

type HoaRow = { id: string; name: string; type: string; storage_path: string | null; created_at: string | null; visible_to_owners?: boolean }
type GovRow = {
  id: string
  title: string
  type: string
  effective_date: string | null
  storage_path: string | null
  ai_generated: boolean | null
  created_at: string | null
  updated_at: string | null
  visible_to_owners?: boolean
}

/** Current, resident-visible documents of one org, both tables. */
export async function fetchResidentDocuments(
  client: Client,
  orgId: string,
  opts: VisibilityOptions = {},
): Promise<ResidentDocument[]> {
  const m1 = opts.m1 ?? M1_APPLIED
  const hoaQ = client
    .from('hoa_documents')
    .select(m1 ? 'id, name, type, storage_path, created_at, visible_to_owners' : 'id, name, type, storage_path, created_at')
    .eq('org_id', orgId)
  const govQ = client
    .from('governing_documents')
    .select(
      m1
        ? 'id, title, type, effective_date, storage_path, ai_generated, created_at, updated_at, visible_to_owners'
        : 'id, title, type, effective_date, storage_path, ai_generated, created_at, updated_at',
    )
    .eq('organization_id', orgId)
    .is('superseded_at', null)
  const [hoaRes, govRes] = await Promise.all([
    m1 ? hoaQ.or(residentVisibleOrFilter('hoa')) : hoaQ.in('type', [...RESIDENT_VISIBLE_TYPES.hoa]),
    m1 ? govQ.or(residentVisibleOrFilter('governing')) : govQ.in('type', [...RESIDENT_VISIBLE_TYPES.governing]),
  ])
  const hoa = { data: hoaRes.data as unknown as HoaRow[] | null, error: hoaRes.error }
  const gov = { data: govRes.data as unknown as GovRow[] | null, error: govRes.error }
  if (hoa.error) throw new Error(`hoa_documents: ${hoa.error.code ?? 'error'}`)
  if (gov.error) throw new Error(`governing_documents: ${gov.error.code ?? 'error'}`)

  const hoaRows = (hoa.data ?? []).filter((d) =>
    isResidentVisible({ source: 'hoa', type: d.type, visibleToOwners: m1 ? d.visible_to_owners : undefined }),
  )

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
    if (
      !isResidentVisible({
        source: 'governing',
        type: d.type,
        aiGenerated: d.ai_generated,
        visibleToOwners: m1 ? d.visible_to_owners : undefined,
      })
    ) {
      continue
    }
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
  opts: VisibilityOptions = {},
): Promise<OpenTarget | null> {
  if (!isUuid(id)) return null
  const m1 = opts.m1 ?? M1_APPLIED
  if (source === 'hoa') {
    const res = await client
      .from('hoa_documents')
      .select(m1 ? 'type, storage_path, visible_to_owners' : 'type, storage_path')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (res.error) throw new Error(`hoa_documents: ${res.error.code ?? 'error'}`)
    const data = res.data as unknown as { type: string; storage_path: string; visible_to_owners?: boolean } | null
    if (
      !data ||
      !canResidentOpen({
        source,
        type: data.type,
        storagePath: data.storage_path,
        visibleToOwners: m1 ? data.visible_to_owners : undefined,
      })
    ) {
      return null
    }
    return { bucket: DOCUMENT_BUCKET.hoa, path: data.storage_path }
  }
  const res = await client
    .from('governing_documents')
    .select(m1 ? 'type, storage_path, ai_generated, superseded_at, visible_to_owners' : 'type, storage_path, ai_generated, superseded_at')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (res.error) throw new Error(`governing_documents: ${res.error.code ?? 'error'}`)
  const data = res.data as unknown as {
    type: string
    storage_path: string | null
    ai_generated: boolean | null
    superseded_at: string | null
    visible_to_owners?: boolean
  } | null
  if (
    !data ||
    !data.storage_path ||
    !canResidentOpen({
      source,
      type: data.type,
      aiGenerated: data.ai_generated,
      superseded: data.superseded_at != null,
      storagePath: data.storage_path,
      visibleToOwners: m1 ? data.visible_to_owners : undefined,
    })
  ) {
    return null
  }
  return { bucket: DOCUMENT_BUCKET.governing, path: data.storage_path }
}

/** Signed-URL lifetime: the route redirects to it immediately. */
export const SIGNED_URL_SECONDS = 60
