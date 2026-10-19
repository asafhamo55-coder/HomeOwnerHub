/**
 * "Ask the guide" (BL-070, spec §6.3): the pure half of the pipeline.
 *
 *   classify → retrieve → gate → (model) → validate
 *
 * Everything here is deterministic and model-free, so the route, the unit
 * tests and `pnpm guide:eval` all run exactly this code. The model call and
 * PII redaction live in ask.ts; nothing in this file sees a network.
 *
 * Fabrication is made impossible here rather than discouraged in a prompt:
 * a citation the sources did not contain is dropped, every URL or path in
 * the model's text is stripped, a `[[Label]]` chip survives only if a cited
 * article has that control, and the deep link is the cited article's
 * frontmatter route, never model text.
 */
import { GUIDE_ARTICLES, GUIDE_SEARCH_INDEX, GUIDE_SECTIONS } from '@/generated/guide'
import { searchBm25 } from './bm25'
import { listRouteFor, matchRouteTemplate } from './routes'
import { synonymsOf, tokenize } from './text'
import type { GuideArticle, GuideBlock, GuideInline, GuideRole } from './types'

export type AskViewerRole = 'admin' | 'board' | 'resident'
type Audience = 'board' | 'resident'

const VISIBLE: Record<AskViewerRole, GuideRole[]> = {
  admin: ['admin', 'board'],
  board: ['board'],
  resident: ['resident'],
}

/** Sources handed to the model, at most. */
export const MAX_SOURCES = 6
/**
 * Gate (spec §6.3 step 3): below this the question is refused before any
 * model call. The score is query coverage (0–1, see `coverageScore`), tuned
 * on content/guide/_eval/questions.yaml with `pnpm guide:eval --verbose`:
 * on 2026-10-17 the highest refusal canary scored 0.44 and the lowest
 * covered how-to 0.65, so the bar sits between them.
 */
export const MIN_SCORE = 0.55
/** Sections of an article the asker is on get this multiplier. */
const ROUTE_BOOST = 1.25
/**
 * Share of the article-level BM25 (title, keywords, summary) added to each
 * section's own score. Sections are indexed on heading and text only, so
 * without this an article's keywords could pass the gate (coverage reads
 * them) but never lift its sections into the top six. 0.3 was the best
 * hit@3 in `pnpm guide:eval --verbose` with no refusal canary closer to
 * MIN_SCORE; 0.4+ starts pulling in sections of a merely related article.
 */
const ARTICLE_WEIGHT = 0.3

const audienceOf = (role: AskViewerRole): Audience => (role === 'resident' ? 'resident' : 'board')
const canSee = (role: AskViewerRole, roles: readonly GuideRole[]) => roles.some((r) => VISIBLE[role].includes(r))
const articleById = new Map<string, GuideArticle>(GUIDE_ARTICLES.map((a) => [a.id, a]))

export function articleHelpHref(articleId: string, audience: Audience, sectionId?: string): string {
  const base = audience === 'resident' ? `/resident/help/${articleId}` : `/help/${articleId}`
  return sectionId ? `${base}#${sectionId}` : base
}

export function askDocsHref(role: AskViewerRole): string {
  return role === 'resident' ? '/resident/ask' : '/ai/ask'
}

// ─── 1. Classify ────────────────────────────────────────────────────────

/**
 * Rules intent, part 1: the question names the community's own documents
 * ("what does our declaration say", "under our bylaws").
 */
const RULES_DOCUMENT =
  /\b(cc&?rs?|covenants?|bylaws?|by-laws?|declaration|deed restrictions?|governing documents?|(our|the) rules?)\b/i
/**
 * Rules intent, part 2: the question asks permission for something done to a
 * home or in the community ("can I paint", "am I allowed", "how tall can").
 */
const RULES_PERMISSION =
  /\b(allow(s|ed)?|permitted|prohibited|banned|forbidden|restrictions?|am i able to|is it (ok|okay|fine) to|can (i|we) (paint|build|install|put|park|keep|have|rent|lease|plant|add|raise|run|hang|store|fly|replace|remove|cut|use)|how (tall|high|many|much|long|late|loud|big|large|early|often|far)\b(\s+[\w'-]+){0,3}\s+can)\b/i
/**
 * App intent: the question is about something the app holds or does. Any of
 * these wins over rules intent, because "how long can a text message be" or
 * "can I add a photo to my request" is a how-to that merely sounds like a
 * permission question. Three kinds of evidence:
 *  - the app itself and its screens;
 *  - a feature noun the guide documents (a text message, the rules check, a
 *    request or application, a bill, a ticket, the rental cap…);
 *  - an app action ("where do I set", "submit", "attach") or a question
 *    about the live state of the data ("right now", "currently").
 * Feature nouns stay app-specific on purpose: "fence", "dog", "rental" or
 * "parking" are what rules questions are about, so they are not here.
 */
const APP_SIGNAL_GROUPS = [
  // the app and its screens
  String.raw`upload|ask the docs|ask the guide|homeownerhub|portal|app|dashboard|sidebar|button|page|screen|guide|log ?in|sign ?in|invite|record|generate|approvals? queue`,
  // feature nouns
  String.raw`arc application|rules check|the check|text messages?|sms|emails?|reminders?|notifications?|statements?|tickets?|(my|the|this|that|an?) ([\w-]+ )?(request|application)s?|photos?|attachments?|drawings?|pdfs?|line items?|bills?|invoices?|journal|ledger|recurring entry|entries|accounts?|admins?|roles?|notes?|documents the ai|the ai|waiting list|(rental|leasing|lease) cap|segments?|announcements?|reports?|csv|spreadsheet|vendors?|rfps?|bids?`,
  // app actions and live state
  String.raw`submit\w*|attach\w*|download\w*|export\w*|edit\w*|turn (on|off)|set ?up|where (do|can) i (set|find|see|enter|change|turn on|turn off)|how do i (set|turn|change|edit|ask)|right now|currently|so far`,
]
const APP_SIGNAL = new RegExp(String.raw`\b(${APP_SIGNAL_GROUPS.join('|')})\b`, 'i')

/**
 * A cheap keyword heuristic: a rules question ("can I paint my door red",
 * "what does the CC&R say") goes to Ask the Docs, which answers from the
 * community's own documents. It needs rules intent AND no app intent, so a
 * how-to that happens to say "allowed", "can I add" or "declaration" stays
 * with the guide.
 */
export function isRulesQuestion(question: string): boolean {
  const rulesIntent = RULES_DOCUMENT.test(question) || RULES_PERMISSION.test(question)
  return rulesIntent && !APP_SIGNAL.test(question)
}

// ─── 2. Retrieve ────────────────────────────────────────────────────────

export interface RetrievedSource {
  /** `S1`…`S6`, the id the model cites. */
  id: string
  articleId: string
  sectionId: string
  heading: string
  title: string
  text: string
  score: number
}

const N_SECTIONS = GUIDE_SEARCH_INDEX.sections.ids.length
/** An idf for a term the corpus has never seen: the rarest possible. */
const UNSEEN_IDF = Math.log(1 + (N_SECTIONS + 0.5) / 0.5)

function idf(term: string): number {
  const p = GUIDE_SEARCH_INDEX.sections.postings[term]
  if (!p) return UNSEEN_IDF
  return Math.log(1 + (N_SECTIONS - p.length + 0.5) / (p.length + 0.5))
}

/** Tokens of one section (and its article's title and keywords). */
const sectionTokens = new Map<string, Set<string>>()
for (const s of GUIDE_SECTIONS) {
  const a = articleById.get(s.articleId)
  sectionTokens.set(
    `${s.articleId}#${s.sectionId}`,
    new Set(tokenize([s.heading, s.text, a?.title ?? '', ...(a?.keywords ?? [])].join(' '))),
  )
}

/**
 * Words that carry no topic, so a section cannot "miss" them. Kept short on
 * purpose: every word here makes the gate easier to pass. Pronouns and
 * "have"/"say" are here because guide prose is written to "you", so "can
 * he fill in his own W-9" or "how much do we have" missed on them alone.
 */
const FILLER = new Set(
  tokenize('another other difference between way want need please also all any some he she his her him have has had say says said'),
)

/**
 * How much of the question one section (with its article's title and
 * keywords) actually covers: idf-weighted share of the question's terms it
 * contains. A term the guide never uses ("clubhouse", "QuickBooks") counts
 * at full weight against it, which is what refuses a question about a
 * feature we don't have even when its other words ("residents", "book")
 * match well.
 */
export function coverageScore(question: string, sectionKey: string): number {
  const terms = [...new Set(tokenize(question))].filter((t) => !FILLER.has(t))
  if (terms.length === 0) return 0
  const have = sectionTokens.get(sectionKey) ?? new Set<string>()
  let total = 0
  let hit = 0
  for (const t of terms) {
    const w = idf(t)
    total += w
    if (have.has(t) || synonymsOf(t).some((x) => have.has(x))) hit += w
  }
  return total > 0 ? Math.round((hit / total) * 1000) / 1000 : 0
}

/**
 * BM25 over GUIDE_SECTIONS plus ARTICLE_WEIGHT of the article-level BM25,
 * filtered to what `role` may see, boosted for the articles of the page the
 * question came from. Top MAX_SOURCES, numbered.
 * `score` on each source is its coverage (0–1), the number the gate reads.
 */
export function retrieve(question: string, role: AskViewerRole, route?: string | null): RetrievedSource[] {
  const visible = GUIDE_SECTIONS.filter((s) => canSee(role, s.roles))
  const allow = new Set(visible.map((s) => `${s.articleId}#${s.sectionId}`))
  let onRoute = new Set<string>()
  if (route) {
    const templates = [...new Set(visible.flatMap((s) => s.routes))]
    const t = matchRouteTemplate(route, templates)
    if (t) onRoute = new Set(visible.filter((s) => s.routes.includes(t)).map((s) => s.articleId))
  }
  const articleScore = new Map(
    searchBm25(GUIDE_SEARCH_INDEX.articles, question, { limit: GUIDE_ARTICLES.length }).map((h) => [h.id, h.score]),
  )
  const hits = searchBm25(GUIDE_SEARCH_INDEX.sections, question, { allow, limit: GUIDE_SECTIONS.length })
    .map((h) => {
      const articleId = h.id.split('#')[0]!
      const blended = h.score + ARTICLE_WEIGHT * (articleScore.get(articleId) ?? 0)
      return { ...h, articleId, bm25: blended * (onRoute.has(articleId) ? ROUTE_BOOST : 1) }
    })
    .sort((a, b) => b.bm25 - a.bm25 || a.id.localeCompare(b.id))
    .slice(0, MAX_SOURCES)
  return hits.map((h, i) => {
    const [articleId, sectionId] = h.id.split('#') as [string, string]
    const section = GUIDE_SECTIONS.find((s) => s.articleId === articleId && s.sectionId === sectionId)!
    return {
      id: `S${i + 1}`,
      articleId,
      sectionId,
      heading: section.heading,
      title: articleById.get(articleId)?.title ?? articleId,
      text: section.text,
      score: coverageScore(question, h.id),
    }
  })
}

/** The gate's number: the best coverage among the retrieved sources. */
export function topScore(sources: readonly RetrievedSource[]): number {
  return sources.reduce((m, s) => Math.max(m, s.score), 0)
}

export function passesGate(sources: readonly RetrievedSource[]): boolean {
  return sources.length > 0 && topScore(sources) >= MIN_SCORE
}

export interface AskSuggestion {
  articleId: string
  title: string
  summary: string
  href: string
}

/** Up to `limit` distinct articles from the sources, best first. */
export function suggestionsFrom(sources: readonly RetrievedSource[], role: AskViewerRole, limit = 3): AskSuggestion[] {
  const audience = audienceOf(role)
  const out: AskSuggestion[] = []
  for (const s of sources) {
    if (out.some((o) => o.articleId === s.articleId)) continue
    const a = articleById.get(s.articleId)
    if (!a) continue
    out.push({ articleId: a.id, title: a.title, summary: a.summary, href: articleHelpHref(a.id, audience) })
    if (out.length >= limit) break
  }
  return out
}

// ─── 3. Prompt ──────────────────────────────────────────────────────────

export const ASK_SYSTEM_PROMPT = `You answer questions about how to use HomeownerHub, an HOA management app, using ONLY the numbered guide sources you are given.

Rules:
- Use only facts in the sources. If the sources do not answer the question, set "covered" to false and leave "answer" empty. Never guess, and never describe a feature the sources do not describe.
- Keep it short. For a how-to, give numbered steps (at most 7), one per line, starting "1. ".
- End every sentence or step with the source it came from, like [S2].
- Name on-screen buttons exactly as the sources do, written as [[Button label]].
- Do not write any URL, web address or page path. The app adds the link itself.
- Questions about what a community's own rules or CC&Rs allow are not covered by the guide: set "covered" to false.

Return JSON only:
{"answer": string, "citations": ["S1", ...], "route": "S1" | null, "covered": boolean}
"citations" lists every source you used. "route" is the one source whose page the person should open next, or null.`

export interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

/** The model sees the sources and the (already redacted) question, nothing else. */
export function buildAskMessages(question: string, sources: readonly RetrievedSource[]): ChatMessage[] {
  const blocks = sources.map((s) => `[${s.id}] ${s.title} — ${s.heading}\n${s.text}`).join('\n\n')
  return [
    { role: 'system', content: ASK_SYSTEM_PROMPT },
    { role: 'user', content: `Sources:\n\n${blocks}\n\nQuestion: ${question}` },
  ]
}

// ─── 4. Validate ────────────────────────────────────────────────────────

export interface AskCitation {
  articleId: string
  title: string
  sectionHeading: string
  href: string
}

export interface ValidatedAnswer {
  /** Plain text. `[1]` markers point into `citations` (1-based); `[[Label]]` marks a real control. */
  answer: string
  citations: AskCitation[]
  takeMeThere: { label: string; href: string } | null
}

interface ModelReply {
  answer: string
  citations: string[]
  route: string | null
  covered: boolean
}

/** Tolerant parse of the model's JSON. Anything else is unusable (null). */
export function parseModelReply(raw: string): ModelReply | null {
  let data: unknown
  try {
    const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    data = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const answer = typeof d.answer === 'string' ? d.answer : ''
  const citations = Array.isArray(d.citations) ? d.citations.filter((c): c is string => typeof c === 'string').slice(0, 20) : []
  const route = typeof d.route === 'string' ? d.route : null
  const covered = d.covered === true
  return { answer, citations, route, covered }
}

function labelsIn(blocks: readonly GuideBlock[]): string[] {
  const out: string[] = []
  const walk = (nodes: readonly GuideInline[]) => {
    for (const n of nodes) {
      if (n.t === 'ui') out.push(n.label)
      else if (n.t === 'strong' || n.t === 'em' || n.t === 'link') walk(n.c)
    }
  }
  for (const b of blocks) {
    if (b.t === 'p') walk(b.c)
    else if (b.t === 'list' || b.t === 'steps') b.items.forEach(walk)
    else if (b.t === 'callout') b.c.forEach(walk)
  }
  return out
}

/** Every `[[Label]]` an article declares, in any section. */
export function articleLabels(articleId: string): Set<string> {
  const a = articleById.get(articleId)
  return new Set(a ? a.sections.flatMap((s) => labelsIn(s.blocks)) : [])
}

const SOURCE_ID = /^S([1-9]\d?)$/

/** Strip every URL, markdown link target and app path the model wrote. */
export function stripLinks(text: string): string {
  return (
    text
      // [text](anything) -> text
      .replace(/\[([^\]\n]+)\]\((?:[^)\s]*)\)/g, '$1')
      // <https://…> and bare URLs, including www.
      .replace(/<?\b(?:https?:\/\/|www\.)[^\s<>()]+>?/gi, '')
      // mailto:/tel: and other schemes
      .replace(/\b(?:mailto|tel|javascript|data):[^\s]+/gi, '')
      // app paths: "/dues", "(/settings/members)", "`/help/x`", but not "and/or"
      .replace(/(^|[\s(`'"])\/[a-z0-9_\-[\]./]*[a-z0-9\]](?=$|[\s).,;:!?`'"])/gim, '$1')
      .replace(/\(\s*\)/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+([.,;:!?])/g, '$1')
      .trim()
  )
}

/**
 * Turn the model's reply into what may reach the client, or null when
 * nothing trustworthy is left (the caller answers `not_covered`).
 */
export function validateModelReply(
  reply: ModelReply,
  sources: readonly RetrievedSource[],
  role: AskViewerRole,
): ValidatedAnswer | null {
  if (!reply.covered) return null
  const audience = audienceOf(role)
  const byId = new Map(sources.map((s) => [s.id, s]))

  // Citations: only ids we provided, in first-cited order, one per section.
  const cited: RetrievedSource[] = []
  const markerIds = [...reply.answer.matchAll(/\[(S\d{1,2})\]/g)].map((m) => m[1]!)
  for (const id of [...markerIds, ...reply.citations]) {
    const key = id.trim().toUpperCase()
    if (!SOURCE_ID.test(key)) continue
    const s = byId.get(key)
    if (s && !cited.includes(s)) cited.push(s)
  }
  if (cited.length === 0) return null

  // Collapse sources of the same article+section into one chip.
  const chips: { key: string; source: RetrievedSource }[] = []
  const chipIndex = new Map<string, number>()
  for (const s of cited) {
    const key = `${s.articleId}#${s.sectionId}`
    if (!chipIndex.has(key)) {
      chipIndex.set(key, chips.length + 1)
      chips.push({ key, source: s })
    }
  }

  const allowedLabels = new Set(cited.flatMap((s) => [...articleLabels(s.articleId)]))
  let text = stripLinks(reply.answer)
    // [S#] markers: renumber kept ones to their chip, drop the rest.
    .replace(/\s*\[(S\d{1,2})\]/gi, (_m, id: string) => {
      const s = byId.get(id.toUpperCase())
      const n = s && cited.includes(s) ? chipIndex.get(`${s.articleId}#${s.sectionId}`) : undefined
      return n ? ` [${n}]` : ''
    })
    // [[Label]] chips only for a control a cited article really has.
    .replace(/\[\[([^\]\n]{1,80})\]\]/g, (_m, label: string) => (allowedLabels.has(label.trim()) ? `[[${label.trim()}]]` : label.trim()))
    .trim()
  // Nothing left but markers and punctuation: there is no answer.
  if (text.replace(/\[\d+\]|[\s.,;:!?-]/g, '').length === 0) return null
  text = text.slice(0, 2000)

  const citations: AskCitation[] = chips.map(({ source: s }) => ({
    articleId: s.articleId,
    title: s.title,
    // The intro's "heading" is the article title; say "Overview" on the chip.
    sectionHeading: s.sectionId === 'overview' ? 'Overview' : s.heading,
    href: articleHelpHref(s.articleId, audience, s.sectionId),
  }))

  // Deep link: the chosen source's article route if it was cited, else the first citation's.
  const routeSource = (reply.route && cited.find((s) => s.id === reply.route!.trim().toUpperCase())) || cited[0]!
  const article = articleById.get(routeSource.articleId)
  const takeMeThere = article ? { label: article.title, href: listRouteFor(article.primaryRoute) } : null

  return { answer: text, citations, takeMeThere }
}
