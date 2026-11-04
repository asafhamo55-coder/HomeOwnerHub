/**
 * Public community page (BL-038, migrations/0077_public_site.sql): the pure
 * rules. No imports, so server code, client forms and tests share them.
 *
 * The page shows ONLY what a board member put there:
 *   - a title, an "about" text and a contact the board typed;
 *   - documents the board added, by their public title, as download links;
 *   - announcements the board added, as a reviewed copy of the text.
 *
 * `toPublicView` is the one projection from stored rows to what a visitor
 * sees. It copies named fields and nothing else, so a column added to a table
 * later (owner name, balance, unit, parsed text) cannot reach the page by
 * accident. `sensitiveHints` stops the obvious mistakes in text the board
 * writes: an email, a phone number, a dollar amount or a street address in an
 * announcement.
 */

import { canResidentOpen, type DocSource } from '../resident-documents/visibility'

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/

/** Words that would collide with the app or read as official. */
const RESERVED_SLUGS = new Set(['admin', 'api', 'app', 'login', 'signup', 'support', 'help', 'www', 'homeownerhub'])

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}

export function validateSlug(slug: string): string | null {
  if (!SLUG_PATTERN.test(slug)) {
    return 'Use 3 to 40 letters, numbers or dashes, like "oak-hollow".'
  }
  if (RESERVED_SLUGS.has(slug)) return 'That web address is taken. Pick another.'
  return null
}

export function publicSitePath(slug: string): string {
  return `/s/${slug}`
}

export function publicDocumentPath(slug: string, itemId: string): string {
  return `/s/${slug}/documents/${itemId}`
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const PHONE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/
const MONEY = /\$\s?\d/
const STREET_ADDRESS =
  /\b\d{1,6}\s+[A-Za-z0-9.' -]{2,40}\s(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|circle|cir|way|boulevard|blvd|place|pl|terrace|ter)\b/i

/**
 * Reasons a text should not go on a public page. Empty means nothing obvious.
 * Names cannot be detected, so the form also asks the board to read the text.
 */
export function sensitiveHints(text: string): string[] {
  const hints: string[] = []
  if (EMAIL.test(text)) hints.push('an email address')
  if (PHONE.test(text)) hints.push('a phone number')
  if (MONEY.test(text)) hints.push('a dollar amount')
  if (STREET_ADDRESS.test(text)) hints.push('a street address')
  return hints
}

export function sensitiveMessage(label: string, text: string): string | null {
  const hints = sensitiveHints(text)
  if (hints.length === 0) return null
  return `${label} has ${hints.join(' and ')}. Take it out before you put it on the public page.`
}

/** Plain text from a stored announcement body (HTML from the editor). */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface SiteRow {
  slug: string
  published: boolean
  title: string
  about: string
  contact_email: string | null
  contact_phone: string | null
}

export interface ItemRow {
  id: string
  kind: string
  title: string
  body: string | null
  posted_at: string
}

export interface PublicView {
  slug: string
  title: string
  about: string
  contactEmail: string | null
  contactPhone: string | null
  documents: { id: string; title: string; href: string }[]
  announcements: { id: string; title: string; body: string; postedAt: string }[]
}

/**
 * The only way stored rows become a page. Returns null for a site that is not
 * published. Reads named fields only; extra properties on a row are ignored.
 */
export function toPublicView(site: SiteRow, items: ItemRow[]): PublicView | null {
  if (site.published !== true) return null
  const documents: PublicView['documents'] = []
  const announcements: PublicView['announcements'] = []
  for (const it of items) {
    if (it.kind === 'document') {
      documents.push({ id: it.id, title: it.title, href: publicDocumentPath(site.slug, it.id) })
    } else if (it.kind === 'announcement' && typeof it.body === 'string') {
      announcements.push({ id: it.id, title: it.title, body: it.body, postedAt: it.posted_at })
    }
  }
  announcements.sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1))
  return {
    slug: site.slug,
    title: site.title,
    about: site.about,
    contactEmail: site.contact_email,
    contactPhone: site.contact_phone,
    documents,
    announcements,
  }
}

/** A stored document may be linked from the public page. */
export function canPublishDocument(doc: {
  storagePath: string | null | undefined
  aiGenerated?: boolean | null
  superseded?: boolean
}): boolean {
  if (typeof doc.storagePath !== 'string' || doc.storagePath.trim() === '') return false
  if (doc.aiGenerated === true) return false
  if (doc.superseded === true) return false
  return true
}

/**
 * Which stored documents may go on a public page: the same rule the resident
 * documents page uses (type allowlist, board-posted flag, current, not AI
 * drafts, file present), plus the page's own association. A governing
 * document tied to another association is out; one with no association
 * (organization-wide) stays. hoa_documents has no association column, so it
 * is organization-wide.
 */
export function canPublishDocumentToSite(
  doc: {
    source: DocSource
    type: string
    storagePath: string | null | undefined
    aiGenerated?: boolean | null
    superseded?: boolean
    visibleToOwners?: boolean | null
    associationId?: string | null
  },
  siteAssociationId: string,
): boolean {
  if (doc.associationId != null && doc.associationId !== siteAssociationId) return false
  return canResidentOpen({
    source: doc.source,
    type: doc.type,
    storagePath: doc.storagePath,
    aiGenerated: doc.aiGenerated,
    superseded: doc.superseded,
    visibleToOwners: doc.visibleToOwners,
  })
}
