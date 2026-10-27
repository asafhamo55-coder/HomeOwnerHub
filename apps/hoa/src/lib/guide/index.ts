/**
 * Runtime access to the compiled guide (BL-070). Everything here reads the
 * generated module; there is no fs and no markdown at runtime.
 */
import { GUIDE_ARTICLES, GUIDE_PATHS, GUIDE_ROUTE_INDEX, GUIDE_SEARCH_INDEX, GUIDE_SECTIONS, GUIDE_TOPICS } from '@/generated/guide'
import { articleHref, type GuideAudience } from './href'
import { searchBm25 } from './bm25'
import { listRouteFor, matchRouteTemplate } from './routes'
import type { GuideArticle, GuideBlock, GuidePath, GuideRole, GuideTopic } from './types'

export type { GuideAudience } from './href'
export { articleHref } from './href'
/** The viewer's app role. Admins see board articles too. */
export type GuideViewerRole = 'admin' | 'board' | 'resident'

const VISIBLE: Record<GuideViewerRole, GuideRole[]> = {
  admin: ['admin', 'board'],
  board: ['board'],
  resident: ['resident'],
}

export function canSee(role: GuideViewerRole, article: Pick<GuideArticle, 'roles'>): boolean {
  return article.roles.some((r) => VISIBLE[role].includes(r))
}

export function audienceOf(role: GuideViewerRole): GuideAudience {
  return role === 'resident' ? 'resident' : 'board'
}

export function articlesFor(role: GuideViewerRole): GuideArticle[] {
  return GUIDE_ARTICLES.filter((a) => canSee(role, a))
}

/** Board pages show any board-app article (the corpus is not secret); residents only theirs. */
export function getArticle(id: string, audience: GuideAudience): GuideArticle | null {
  const a = GUIDE_ARTICLES.find((x) => x.id === id)
  if (!a) return null
  const isResident = a.roles.includes('resident')
  return (audience === 'resident') === isResident ? a : null
}

export function topicsFor(role: GuideViewerRole): { topic: GuideTopic; articles: GuideArticle[] }[] {
  const mine = articlesFor(role)
  return GUIDE_TOPICS.map((topic) => ({ topic, articles: mine.filter((a) => a.topic === topic.id) })).filter((t) => t.articles.length > 0)
}

export function getTopic(id: string): GuideTopic | null {
  return GUIDE_TOPICS.find((t) => t.id === id) ?? null
}

export function pathsFor(role: GuideViewerRole): { path: GuidePath; articles: GuideArticle[] }[] {
  return GUIDE_PATHS.filter((p) => p.roles.some((r) => VISIBLE[role].includes(r)))
    .map((path) => ({
      path,
      articles: path.articles.map((id) => GUIDE_ARTICLES.find((a) => a.id === id)).filter((a): a is GuideArticle => !!a && canSee(role, a)),
    }))
    .filter((p) => p.articles.length > 0)
}

/**
 * The help-page link for a guide article referenced from app code (empty
 * states, the setup checklist). Throws on an unknown id, and guide:check
 * fails CI on any `guideHref('…')` naming no article, so a renamed article
 * can't silently become a 404.
 */
export function guideHref(id: string, audience: GuideAudience = 'board'): string {
  if (!GUIDE_ARTICLES.some((a) => a.id === id)) throw new Error(`guideHref: unknown guide article "${id}"`)
  return articleHref(id, audience)
}

export function helpHomeHref(audience: GuideAudience): string {
  return audience === 'resident' ? '/resident/help' : '/help'
}

/** "Take me there": the primary route, or its list page when it has an `[id]`. */
export function takeMeThereHref(article: Pick<GuideArticle, 'primaryRoute'>): string {
  return listRouteFor(article.primaryRoute)
}

/** Articles for the "?" drawer on `pathname` (most specific template), visible to `role`. */
export function articlesForPath(pathname: string, role: GuideViewerRole, limit = 5): GuideArticle[] {
  const templates = Object.keys(GUIDE_ROUTE_INDEX).filter((t) => (GUIDE_ROUTE_INDEX[t] ?? []).some((id) => canSee(role, byId(id))))
  const template = matchRouteTemplate(pathname, templates)
  if (!template) return []
  return (GUIDE_ROUTE_INDEX[template] ?? [])
    .map(byId)
    .filter((a) => canSee(role, a))
    .slice(0, limit)
}

function byId(id: string): GuideArticle {
  return GUIDE_ARTICLES.find((a) => a.id === id)!
}

/** The Steps section without screenshots: what the drawer expands inline. */
export function stepsBlocks(article: GuideArticle): GuideBlock[] {
  return (article.sections.find((s) => s.id === 'steps')?.blocks ?? []).filter((b) => b.t !== 'shot')
}

export interface SectionHit {
  article: GuideArticle
  sectionId: string
  heading: string
  snippet: string
}

/** Full-text search over sections (server side). One hit per article, best section first. */
export function searchSections(query: string, role: GuideViewerRole, limit = 10): SectionHit[] {
  const visible = new Set(GUIDE_SECTIONS.filter((s) => canSee(role, s)).map((s) => `${s.articleId}#${s.sectionId}`))
  const hits = searchBm25(GUIDE_SEARCH_INDEX.sections, query, { allow: visible, limit: 50 })
  const seen = new Set<string>()
  const out: SectionHit[] = []
  for (const h of hits) {
    const [articleId, sectionId] = h.id.split('#') as [string, string]
    if (seen.has(articleId)) continue
    seen.add(articleId)
    const section = GUIDE_SECTIONS.find((s) => s.articleId === articleId && s.sectionId === sectionId)
    if (!section) continue
    out.push({ article: byId(articleId), sectionId, heading: section.heading, snippet: snippet(section.text, query) })
    if (out.length >= limit) break
  }
  return out
}

function snippet(text: string, query: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2)
  const lower = flat.toLowerCase()
  const at = words.map((w) => lower.indexOf(w.slice(0, Math.max(3, w.length - 2)))).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0
  const start = Math.max(0, at - 40)
  const s = flat.slice(start, start + max)
  return `${start > 0 ? '…' : ''}${s}${start + max < flat.length ? '…' : ''}`
}

/** What the client needs for instant search: the article index plus display fields. */
export interface InstantSearchData {
  index: typeof GUIDE_SEARCH_INDEX.articles
  articles: { id: string; title: string; summary: string; href: string }[]
}

export function instantSearchData(role: GuideViewerRole): InstantSearchData {
  const audience = audienceOf(role)
  return {
    index: GUIDE_SEARCH_INDEX.articles,
    articles: articlesFor(role).map((a) => ({ id: a.id, title: a.title, summary: a.summary, href: articleHref(a.id, audience) })),
  }
}

/** What the "?" drawer needs (serialisable, role-filtered). */
export interface DrawerArticle {
  id: string
  title: string
  summary: string
  href: string
  steps: GuideBlock[]
}

export interface DrawerData {
  audience: GuideAudience
  /** route template -> article ids, only templates with a visible article. */
  routeIndex: Record<string, string[]>
  articles: Record<string, DrawerArticle>
  startHere: { label: string; articleIds: string[] }[]
}

export function drawerData(role: GuideViewerRole): DrawerData {
  const audience = audienceOf(role)
  const mine = articlesFor(role)
  const ids = new Set(mine.map((a) => a.id))
  const routeIndex: Record<string, string[]> = {}
  for (const [t, list] of Object.entries(GUIDE_ROUTE_INDEX)) {
    const v = list.filter((id) => ids.has(id))
    if (v.length) routeIndex[t] = v
  }
  return {
    audience,
    routeIndex,
    articles: Object.fromEntries(
      mine.map((a) => [a.id, { id: a.id, title: a.title, summary: a.summary, href: articleHref(a.id, audience), steps: stepsBlocks(a) }]),
    ),
    startHere: pathsFor(role).map((p) => ({ label: p.path.label, articleIds: p.articles.map((a) => a.id) })),
  }
}
