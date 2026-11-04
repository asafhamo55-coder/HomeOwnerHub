'use server'

/**
 * Public community page: the board's builder (BL-038, migration 0077).
 *
 * Every function checks M12_APPLIED first, then that the caller is a board
 * member or admin of the current org. Reads of the board's own candidates go
 * through the user's client (RLS scopes them); writes go through the service
 * role, scoped by organization_id on every statement, because the tables have
 * no write policy for the web roles.
 *
 * Nothing is public until `setSitePublished(true)`. Items are added one by
 * one; an announcement is stored as a copy of the text the board reviewed.
 * Nothing here emails or texts anyone. Logs carry codes only.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { residentVisibleOrFilter } from '@/lib/resident-documents/query'
import { M12_APPLIED } from '@homeowner-portal/db/m12'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { canPublishDocumentToSite, htmlToPlainText, sensitiveMessage, slugify, validateSlug, type SiteRow } from './content'

type ActionErr = { ok: false; error: string; fieldErrors?: Record<string, string> }
export type SiteResult<T = void> = (T extends void ? { ok: true } : { ok: true; data: T }) | ActionErr

const NOT_READY = 'The public page isn’t ready yet. We’ll turn it on soon.'
const GENERIC = 'Couldn’t save that. Please try again.'

export interface BoardSite extends SiteRow {
  id: string
}
export interface BoardItem {
  id: string
  kind: 'document' | 'announcement'
  title: string
  body: string | null
  postedAt: string
}
export interface DocumentChoice {
  source: 'hoa' | 'governing'
  id: string
  title: string
  added: boolean
}
export interface AnnouncementChoice {
  id: string
  subject: string
  text: string
  sentAt: string | null
}
export interface BoardPublicSite {
  association: { id: string; name: string }
  site: BoardSite | null
  suggestedSlug: string
  items: BoardItem[]
  documents: DocumentChoice[]
  announcements: AnnouncementChoice[]
}
export type BoardPublicSiteLoad =
  | { ok: true; data: BoardPublicSite }
  | { ok: false; reason: 'not_ready' | 'forbidden' | 'no_association' | 'failed' }

function invalid(e: z.ZodError): ActionErr {
  const fieldErrors: Record<string, string> = {}
  for (const issue of e.issues) {
    const key = String(issue.path[0] ?? '')
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
  }
  return { ok: false, error: e.issues[0]?.message ?? 'Check the form.', fieldErrors }
}

async function gate(): Promise<{ ok: true; orgId: string; userId: string } | ActionErr> {
  if (!M12_APPLIED) return { ok: false, error: NOT_READY }
  const g = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!g.ok) return { ok: false, error: g.error }
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You are not signed in.' }
  return { ok: true, orgId: g.orgId, userId: user.id }
}

async function primaryAssociation(orgId: string): Promise<{ id: string; name: string } | null | 'failed'> {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('associations')
    .select('id, name')
    .eq('organization_id', orgId)
    .order('name', { ascending: true })
    .limit(1)
  if (error) {
    console.error('[public-site] association read failed', { code: error.code ?? null })
    return 'failed'
  }
  return ((data ?? []) as { id: string; name: string }[])[0] ?? null
}

export async function getBoardPublicSite(): Promise<BoardPublicSiteLoad> {
  if (!M12_APPLIED) return { ok: false, reason: 'not_ready' }
  const g = await gate()
  if (!g.ok) return { ok: false, reason: 'forbidden' }
  const assoc = await primaryAssociation(g.orgId)
  if (assoc === 'failed') return { ok: false, reason: 'failed' }
  if (!assoc) return { ok: false, reason: 'no_association' }

  const supabase = await getSupabaseServerClient()
  const [siteRes, hoaRes, govRes, commRes] = await Promise.all([
    supabase
      .from('public_sites' as never)
      .select('id, slug, published, title, about, contact_email, contact_phone')
      .eq('association_id' as never, assoc.id)
      .maybeSingle(),
    supabase
      .from('hoa_documents')
      .select('id, name, type, storage_path, visible_to_owners')
      .eq('org_id', g.orgId)
      .or(residentVisibleOrFilter('hoa'))
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('governing_documents')
      .select('id, title, type, storage_path, ai_generated, superseded_at, visible_to_owners, association_id')
      .eq('organization_id', g.orgId)
      .is('superseded_at', null)
      .or(`association_id.is.null,association_id.eq.${assoc.id}`)
      .or(residentVisibleOrFilter('governing'))
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('communications')
      .select('id, subject, body_html, sent_at')
      .eq('organization_id', g.orgId)
      .eq('association_id', assoc.id)
      .eq('category', 'announcement')
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(20),
  ])
  for (const r of [siteRes, hoaRes, govRes, commRes]) {
    if (r.error) {
      console.error('[public-site] board read failed', { code: r.error.code ?? null })
      return { ok: false, reason: 'failed' }
    }
  }

  const site = (siteRes.data as BoardSite | null) ?? null
  let items: BoardItem[] = []
  const addedHoa = new Set<string>()
  const addedGov = new Set<string>()
  if (site) {
    const itemRes = await supabase
      .from('public_site_items' as never)
      .select('id, kind, title, body, posted_at, hoa_document_id, governing_document_id')
      .eq('site_id' as never, site.id)
      .order('posted_at' as never, { ascending: false })
    if (itemRes.error) {
      console.error('[public-site] items read failed', { code: itemRes.error.code ?? null })
      return { ok: false, reason: 'failed' }
    }
    const rows = (itemRes.data ?? []) as unknown as {
      id: string
      kind: 'document' | 'announcement'
      title: string
      body: string | null
      posted_at: string
      hoa_document_id: string | null
      governing_document_id: string | null
    }[]
    for (const r of rows) {
      if (r.hoa_document_id) addedHoa.add(r.hoa_document_id)
      if (r.governing_document_id) addedGov.add(r.governing_document_id)
    }
    items = rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, postedAt: r.posted_at }))
  }

  const documents: DocumentChoice[] = [
    ...(hoaRes.data ?? [])
      .filter((d) =>
        canPublishDocumentToSite({ source: 'hoa', type: d.type, storagePath: d.storage_path, visibleToOwners: d.visible_to_owners }, assoc.id),
      )
      .map((d) => ({ source: 'hoa' as const, id: d.id, title: d.name, added: addedHoa.has(d.id) })),
    ...(govRes.data ?? [])
      .filter((d) =>
        canPublishDocumentToSite(
          {
            source: 'governing',
            type: d.type,
            storagePath: d.storage_path,
            aiGenerated: d.ai_generated,
            superseded: d.superseded_at != null,
            visibleToOwners: d.visible_to_owners,
            associationId: d.association_id,
          },
          assoc.id,
        ),
      )
      .map((d) => ({ source: 'governing' as const, id: d.id, title: d.title, added: addedGov.has(d.id) })),
  ]
  const announcements: AnnouncementChoice[] = (commRes.data ?? []).map((c) => ({
    id: c.id,
    subject: c.subject,
    text: htmlToPlainText(c.body_html ?? '').slice(0, 8000),
    sentAt: c.sent_at,
  }))

  return {
    ok: true,
    data: { association: assoc, site, suggestedSlug: slugify(assoc.name), items, documents, announcements },
  }
}

const SaveSchema = z.object({
  title: z.string().trim().min(1, 'Add a title.').max(120, 'Keep the title under 120 letters.'),
  slug: z.string().trim().toLowerCase(),
  about: z.string().trim().max(4000, 'Keep this under 4,000 letters.'),
  contactEmail: z.string().trim().max(200).email('That email doesn’t look right.').or(z.literal('')),
  contactPhone: z.string().trim().max(40, 'That phone number is too long.'),
})
export type SaveSiteInput = z.input<typeof SaveSchema>

/** Create the page (private) or change its words. Never changes published. */
export async function saveSite(input: SaveSiteInput): Promise<SiteResult> {
  const g = await gate()
  if (!g.ok) return g
  const parsed = SaveSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const v = parsed.data

  const slugErr = validateSlug(v.slug)
  if (slugErr) return { ok: false, error: slugErr, fieldErrors: { slug: slugErr } }
  const aboutErr = sensitiveMessage('The About text', v.about)
  if (aboutErr) return { ok: false, error: aboutErr, fieldErrors: { about: aboutErr } }

  const assoc = await primaryAssociation(g.orgId)
  if (assoc === 'failed') return { ok: false, error: GENERIC }
  if (!assoc) return { ok: false, error: 'Set up your association first.' }

  const db = createAdminClient()
  const { data: existing, error: readErr } = await db
    .from('public_sites' as never)
    .select('id')
    .eq('association_id' as never, assoc.id)
    .eq('organization_id' as never, g.orgId)
    .maybeSingle()
  if (readErr) {
    console.error('[public-site] save read failed', { code: readErr.code ?? null })
    return { ok: false, error: GENERIC }
  }

  const fields = {
    slug: v.slug,
    title: v.title,
    about: v.about,
    contact_email: v.contactEmail === '' ? null : v.contactEmail,
    contact_phone: v.contactPhone === '' ? null : v.contactPhone,
  }
  const res = existing
    ? await db
        .from('public_sites' as never)
        .update(fields as never)
        .eq('id' as never, (existing as { id: string }).id)
        .eq('organization_id' as never, g.orgId)
    : await db.from('public_sites' as never).insert({
        ...fields,
        organization_id: g.orgId,
        association_id: assoc.id,
        published: false,
        created_by: g.userId,
      } as never)
  if (res.error) {
    if (res.error.code === '23505') {
      const msg = 'That web address is already used. Pick another.'
      return { ok: false, error: msg, fieldErrors: { slug: msg } }
    }
    console.error('[public-site] save failed', { code: res.error.code ?? null })
    return { ok: false, error: GENERIC }
  }
  revalidatePath('/settings/public-site')
  revalidatePath(`/s/${v.slug}`)
  return { ok: true }
}

async function ownSite(orgId: string): Promise<{ id: string; slug: string; association_id: string } | null> {
  const assoc = await primaryAssociation(orgId)
  if (!assoc || assoc === 'failed') return null
  const { data, error } = await createAdminClient()
    .from('public_sites' as never)
    .select('id, slug, association_id')
    .eq('association_id' as never, assoc.id)
    .eq('organization_id' as never, orgId)
    .maybeSingle()
  if (error) {
    console.error('[public-site] site read failed', { code: error.code ?? null })
    return null
  }
  return (data as { id: string; slug: string; association_id: string } | null) ?? null
}

/** The one switch that makes the page visible to everyone. */
export async function setSitePublished(published: boolean): Promise<SiteResult> {
  const g = await gate()
  if (!g.ok) return g
  const site = await ownSite(g.orgId)
  if (!site) return { ok: false, error: 'Save your page first.' }
  const { error } = await createAdminClient()
    .from('public_sites' as never)
    .update({ published: published === true, published_at: published === true ? new Date().toISOString() : null } as never)
    .eq('id' as never, site.id)
    .eq('organization_id' as never, g.orgId)
  if (error) {
    console.error('[public-site] publish failed', { code: error.code ?? null })
    return { ok: false, error: GENERIC }
  }
  revalidatePath('/settings/public-site')
  revalidatePath(`/s/${site.slug}`)
  return { ok: true }
}

const DocSchema = z.object({
  source: z.enum(['hoa', 'governing']),
  id: z.string().uuid(),
  title: z.string().trim().min(1, 'Add a title.').max(200),
})

/** Put one existing document on the page. */
export async function addDocumentToSite(input: z.input<typeof DocSchema>): Promise<SiteResult> {
  const g = await gate()
  if (!g.ok) return g
  const parsed = DocSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const v = parsed.data
  const site = await ownSite(g.orgId)
  if (!site) return { ok: false, error: 'Save your page first.' }

  const db = createAdminClient()
  const doc =
    v.source === 'hoa'
      ? await db.from('hoa_documents').select('storage_path, type, visible_to_owners').eq('id', v.id).eq('org_id', g.orgId).maybeSingle()
      : await db
          .from('governing_documents')
          .select('storage_path, type, ai_generated, superseded_at, visible_to_owners, association_id')
          .eq('id', v.id)
          .eq('organization_id', g.orgId)
          .maybeSingle()
  if (doc.error) {
    console.error('[public-site] doc read failed', { code: doc.error.code ?? null })
    return { ok: false, error: GENERIC }
  }
  const row = doc.data as {
    storage_path: string | null
    type: string
    visible_to_owners?: boolean | null
    association_id?: string | null
    ai_generated?: boolean | null
    superseded_at?: string | null
  } | null
  if (
    !row ||
    !canPublishDocumentToSite(
      {
        source: v.source,
        type: row.type,
        storagePath: row.storage_path,
        aiGenerated: row.ai_generated,
        superseded: row.superseded_at != null,
        visibleToOwners: row.visible_to_owners,
        associationId: row.association_id,
      },
      site.association_id,
    )
  ) {
    return { ok: false, error: 'That document can’t go on the public page.' }
  }

  const { error } = await db.from('public_site_items' as never).insert({
    organization_id: g.orgId,
    site_id: site.id,
    kind: 'document',
    hoa_document_id: v.source === 'hoa' ? v.id : null,
    governing_document_id: v.source === 'governing' ? v.id : null,
    title: v.title,
    created_by: g.userId,
  } as never)
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'That document is already on the page.' }
    console.error('[public-site] add document failed', { code: error.code ?? null })
    return { ok: false, error: GENERIC }
  }
  revalidatePath('/settings/public-site')
  revalidatePath(`/s/${site.slug}`)
  return { ok: true }
}

const AnnouncementSchema = z.object({
  title: z.string().trim().min(1, 'Add a title.').max(200),
  body: z.string().trim().min(1, 'Add the message.').max(8000, 'Keep this under 8,000 letters.'),
})

/** Put a reviewed copy of an announcement on the page. */
export async function addAnnouncementToSite(input: z.input<typeof AnnouncementSchema>): Promise<SiteResult> {
  const g = await gate()
  if (!g.ok) return g
  const parsed = AnnouncementSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const v = parsed.data
  const titleErr = sensitiveMessage('The title', v.title)
  if (titleErr) return { ok: false, error: titleErr, fieldErrors: { title: titleErr } }
  const bodyErr = sensitiveMessage('The message', v.body)
  if (bodyErr) return { ok: false, error: bodyErr, fieldErrors: { body: bodyErr } }
  const site = await ownSite(g.orgId)
  if (!site) return { ok: false, error: 'Save your page first.' }

  const { error } = await createAdminClient()
    .from('public_site_items' as never)
    .insert({
      organization_id: g.orgId,
      site_id: site.id,
      kind: 'announcement',
      title: v.title,
      body: v.body,
      created_by: g.userId,
    } as never)
  if (error) {
    console.error('[public-site] add announcement failed', { code: error.code ?? null })
    return { ok: false, error: GENERIC }
  }
  revalidatePath('/settings/public-site')
  revalidatePath(`/s/${site.slug}`)
  return { ok: true }
}

/** Take one item off the page. */
export async function removeSiteItem(itemId: string): Promise<SiteResult> {
  const g = await gate()
  if (!g.ok) return g
  if (!z.string().uuid().safeParse(itemId).success) return { ok: false, error: GENERIC }
  const site = await ownSite(g.orgId)
  if (!site) return { ok: false, error: 'Save your page first.' }
  const { error } = await createAdminClient()
    .from('public_site_items' as never)
    .delete()
    .eq('id' as never, itemId)
    .eq('site_id' as never, site.id)
    .eq('organization_id' as never, g.orgId)
  if (error) {
    console.error('[public-site] remove failed', { code: error.code ?? null })
    return { ok: false, error: GENERIC }
  }
  revalidatePath('/settings/public-site')
  revalidatePath(`/s/${site.slug}`)
  return { ok: true }
}
