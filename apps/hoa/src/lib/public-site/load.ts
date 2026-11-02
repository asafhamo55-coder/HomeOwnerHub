/**
 * Public community page: the visitor-side reads (BL-038).
 *
 * No session here, so the service role reads, from explicit column lists, and
 * every answer goes through content.ts. Nothing reaches a visitor unless:
 *   - M12_APPLIED is true;
 *   - the site row is published;
 *   - the item row is on that site (a board member added it).
 * A document additionally has to be a current, human-made file with a stored
 * path. Not found, unpublished and not allowed all answer the same way, so a
 * visitor cannot probe which pages or files exist.
 *
 * Logs carry codes only. No 'use server', no Next imports.
 */
import { createAdminClient } from '@homeowner-portal/db'
import { M12_APPLIED } from '@homeowner-portal/db/m12'
import { DOCUMENT_BUCKET } from '@/lib/resident-documents/visibility'
import { canPublishDocument, toPublicView, validateSlug, type ItemRow, type PublicView, type SiteRow } from './content'

type SiteWithIds = SiteRow & { id: string; organization_id: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function loadPublishedSite(slug: string): Promise<SiteWithIds | null> {
  if (!M12_APPLIED) return null
  if (validateSlug(slug) !== null) return null
  const { data, error } = await createAdminClient()
    .from('public_sites' as never)
    .select('id, organization_id, slug, published, title, about, contact_email, contact_phone')
    .eq('slug' as never, slug)
    .eq('published' as never, true)
    .maybeSingle()
  if (error) {
    console.error('[public-site] site read failed', { code: error.code ?? null })
    return null
  }
  return (data as SiteWithIds | null) ?? null
}

/** The page for a slug, or null (unknown, unpublished, feature off, read failed). */
export async function loadPublicPage(slug: string): Promise<PublicView | null> {
  const site = await loadPublishedSite(slug)
  if (!site) return null
  const { data, error } = await createAdminClient()
    .from('public_site_items' as never)
    .select('id, kind, title, body, posted_at')
    .eq('site_id' as never, site.id)
    .order('posted_at' as never, { ascending: false })
    .limit(200)
  if (error) {
    console.error('[public-site] items read failed', { code: error.code ?? null })
    return null
  }
  return toPublicView(site, (data ?? []) as unknown as ItemRow[])
}

export interface PublicDocumentTarget {
  bucket: string
  path: string
}

/** The stored file behind one public document link, or null. */
export async function loadPublicDocument(slug: string, itemId: string): Promise<PublicDocumentTarget | null> {
  if (!UUID.test(itemId)) return null
  const site = await loadPublishedSite(slug)
  if (!site) return null
  const db = createAdminClient()
  const { data: item, error } = await db
    .from('public_site_items' as never)
    .select('kind, hoa_document_id, governing_document_id')
    .eq('id' as never, itemId)
    .eq('site_id' as never, site.id)
    .eq('kind' as never, 'document')
    .maybeSingle()
  if (error) {
    console.error('[public-site] item read failed', { code: error.code ?? null })
    return null
  }
  const row = item as { hoa_document_id: string | null; governing_document_id: string | null } | null
  if (!row) return null

  if (row.hoa_document_id) {
    const { data: doc, error: e } = await db
      .from('hoa_documents')
      .select('storage_path')
      .eq('id', row.hoa_document_id)
      .eq('org_id', site.organization_id)
      .maybeSingle()
    if (e) {
      console.error('[public-site] document read failed', { code: e.code ?? null })
      return null
    }
    if (!doc || !canPublishDocument({ storagePath: doc.storage_path })) return null
    return { bucket: DOCUMENT_BUCKET.hoa, path: doc.storage_path }
  }

  if (row.governing_document_id) {
    const { data: doc, error: e } = await db
      .from('governing_documents')
      .select('storage_path, ai_generated, superseded_at')
      .eq('id', row.governing_document_id)
      .eq('organization_id', site.organization_id)
      .maybeSingle()
    if (e) {
      console.error('[public-site] document read failed', { code: e.code ?? null })
      return null
    }
    if (
      !doc ||
      !canPublishDocument({ storagePath: doc.storage_path, aiGenerated: doc.ai_generated, superseded: doc.superseded_at != null })
    ) {
      return null
    }
    return { bucket: DOCUMENT_BUCKET.governing, path: doc.storage_path as string }
  }
  return null
}
