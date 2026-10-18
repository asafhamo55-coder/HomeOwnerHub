/**
 * The guide compiler (spec §5.1): markdown + YAML frontmatter -> block AST,
 * H2 sections, route index and BM25 search indexes, emitted as one
 * TypeScript module (apps/hoa/src/generated/guide.ts).
 *
 * Pure: takes file contents, returns data plus a list of errors. The CLI
 * (scripts/guide-build.ts) does the fs work; guide:check reuses this to
 * lint. `marked` is used here, at build time only — the app renders the
 * AST with design-system components and ships no markdown library.
 */
import { Lexer, type Token, type Tokens } from 'marked'
import YAML from 'yaml'
import { z } from 'zod'
import { buildBm25 } from '../../apps/hoa/src/lib/guide/bm25'
import {
  GUIDE_SECTION_HEADINGS,
  type GuideArticle,
  type GuideArticleSection,
  type GuideBlock,
  type GuideInline,
  type GuidePath,
  type GuideSearchIndex,
  type GuideSection,
  type GuideTopic,
  type WhatsNewEntry,
} from '../../apps/hoa/src/lib/guide/types'
import { compileWhatsNew } from './whats-new'

export const MAX_STEPS = 7

const ROLE = z.enum(['admin', 'board', 'resident'])
const ROUTE = z.string().regex(/^\/[A-Za-z0-9\-[\].\/]*$/, 'must be an app route like /dues or /violations/[id]')
const ID = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be kebab-case')

export const FrontmatterSchema = z
  .object({
    id: ID,
    title: z.string().min(1).max(90),
    summary: z.string().min(1, 'summary is required').max(160, 'summary must be 160 characters or fewer'),
    topic: ID,
    roles: z.array(ROLE).min(1),
    routes: z.array(ROUTE).min(1),
    primary_route: ROUTE,
    keywords: z.array(z.string().min(1)).default([]),
    shots: z.array(z.object({ name: ID, alt: z.string().min(1) }).strict()).default([]),
    related: z.array(ID).default([]),
    reviewed: z.preprocess(
      (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'reviewed must be a YYYY-MM-DD date'),
    ),
  })
  .strict()

export const MetaSchema = z
  .object({
    topics: z.array(z.object({ id: ID, label: z.string().min(1), description: z.string().min(1) }).strict()).min(1),
    paths: z
      .array(
        z
          .object({ id: ID, label: z.string().min(1), description: z.string().min(1), roles: z.array(ROLE).min(1), articles: z.array(ID).min(1) })
          .strict(),
      )
      .default([]),
  })
  .strict()
export type GuideMeta = z.input<typeof MetaSchema>

export function parseFrontmatter(src: string): { data: unknown; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(src)
  if (!m) throw new Error('missing YAML frontmatter (--- ... ---) at the top of the file')
  return { data: YAML.parse(m[1]!), body: m[2]! }
}

const SHOT_RE = /^!\[\[([a-z0-9-]+)\]\]$/
const UI_RE = /\[\[([^\]\n]+)\]\]/g

export function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function mergeText(out: GuideInline[]): GuideInline[] {
  const merged: GuideInline[] = []
  for (const n of out) {
    const prev = merged[merged.length - 1]
    if (n.t === 'text' && prev?.t === 'text') prev.v += n.v
    else if (!(n.t === 'text' && n.v === '')) merged.push(n)
  }
  return merged
}

function splitLabels(text: string, errors: string[]): GuideInline[] {
  if (text.includes('![[')) errors.push(`a screenshot (![[...]]) must be on its own line: "${text.trim().slice(0, 60)}"`)
  const out: GuideInline[] = []
  let last = 0
  for (const m of text.matchAll(UI_RE)) {
    out.push({ t: 'text', v: text.slice(last, m.index) })
    out.push({ t: 'ui', label: m[1]!.trim() })
    last = m.index! + m[0].length
  }
  out.push({ t: 'text', v: text.slice(last) })
  return out
}

function inlines(tokens: Token[] | undefined, errors: string[]): GuideInline[] {
  const out: GuideInline[] = []
  for (const tok of tokens ?? []) {
    switch (tok.type) {
      case 'text': {
        const t = tok as Tokens.Text
        if (t.tokens?.length) out.push(...inlines(t.tokens, errors))
        else out.push(...splitLabels(t.text, errors))
        break
      }
      case 'escape':
        out.push({ t: 'text', v: (tok as Tokens.Escape).text })
        break
      case 'strong':
        out.push({ t: 'strong', c: inlines((tok as Tokens.Strong).tokens, errors) })
        break
      case 'em':
        out.push({ t: 'em', c: inlines((tok as Tokens.Em).tokens, errors) })
        break
      case 'codespan':
        out.push({ t: 'code', v: (tok as Tokens.Codespan).text })
        break
      case 'br':
        out.push({ t: 'text', v: ' ' })
        break
      case 'link': {
        const l = tok as Tokens.Link
        const c = inlines(l.tokens, errors)
        if (l.href.startsWith('guide:')) out.push({ t: 'link', kind: 'guide', href: l.href.slice(6), c })
        else if (l.href.startsWith('/')) out.push({ t: 'link', kind: 'route', href: l.href, c })
        else {
          errors.push(`link "${l.href}" must be an app route (/dues) or a guide link (guide:<article-id>)`)
          out.push(...c)
        }
        break
      }
      case 'image':
        errors.push(`plain images are not allowed (use ![[shot-name]]): ${(tok as Tokens.Image).href}`)
        break
      case 'html':
        errors.push(`raw HTML is not allowed: ${(tok as Tokens.HTML).text.trim().slice(0, 40)}`)
        break
      default:
        errors.push(`unsupported inline markdown: ${tok.type}`)
    }
  }
  return mergeText(out)
}

function listItems(list: Tokens.List, errors: string[]): GuideInline[][] {
  return list.items.map((item) => {
    const parts: GuideInline[] = []
    for (const child of item.tokens) {
      if (child.type === 'text' || child.type === 'paragraph') {
        if (parts.length) parts.push({ t: 'text', v: ' ' })
        parts.push(...inlines((child as Tokens.Text).tokens ?? [child], errors))
      } else if (child.type === 'space') continue
      else errors.push(`nested ${child.type} inside a list item is not supported`)
    }
    return mergeText(parts)
  })
}

export interface CompiledArticle {
  article?: GuideArticle
  errors: string[]
}

export function compileArticle(src: string, source: string): CompiledArticle {
  const errors: string[] = []
  let parsed: { data: unknown; body: string }
  try {
    parsed = parseFrontmatter(src)
  } catch (e) {
    return { errors: [(e as Error).message] }
  }
  const fm = FrontmatterSchema.safeParse(parsed.data)
  if (!fm.success) {
    return {
      errors: fm.error.issues.map((i) =>
        i.code === 'unrecognized_keys' ? `unknown frontmatter key(s): ${i.keys.join(', ')}` : `frontmatter ${i.path.join('.') || '(root)'}: ${i.message}`,
      ),
    }
  }
  const f = fm.data
  const shotAlt = new Map(f.shots.map((s) => [s.name, s.alt]))

  const sections: GuideArticleSection[] = [{ id: 'overview', heading: null, blocks: [] }]
  const current = () => sections[sections.length - 1]!
  for (const tok of new Lexer().lex(parsed.body)) {
    switch (tok.type) {
      case 'space':
      case 'hr':
        break
      case 'heading': {
        const h = tok as Tokens.Heading
        if (h.depth === 1) errors.push(`H1 heading "${h.text}" is not allowed: the title comes from the frontmatter`)
        else if (h.depth === 2) {
          if (!(GUIDE_SECTION_HEADINGS as readonly string[]).includes(h.text)) {
            errors.push(`H2 "${h.text}" is not one of: ${GUIDE_SECTION_HEADINGS.join(', ')}`)
          }
          if (sections.some((s) => s.heading === h.text)) errors.push(`H2 "${h.text}" appears twice`)
          sections.push({ id: slugify(h.text), heading: h.text, blocks: [] })
        } else if (h.depth === 3) current().blocks.push({ t: 'h3', text: h.text })
        else errors.push(`heading level ${h.depth} is not supported`)
        break
      }
      case 'paragraph': {
        const p = tok as Tokens.Paragraph
        const shot = SHOT_RE.exec(p.text.trim())
        if (shot) {
          const name = shot[1]!
          const alt = shotAlt.get(name)
          if (!alt) errors.push(`screenshot ![[${name}]] is not declared in the frontmatter shots list`)
          current().blocks.push({ t: 'shot', name, alt: alt ?? '' })
        } else current().blocks.push({ t: 'p', c: inlines(p.tokens, errors) })
        break
      }
      case 'list': {
        const l = tok as Tokens.List
        const items = listItems(l, errors)
        if (l.ordered) {
          if (current().heading !== 'Steps') errors.push(`numbered lists belong in the "Steps" section (found under "${current().heading ?? 'the intro'}")`)
          if (items.length > MAX_STEPS) errors.push(`Steps has ${items.length} items; the limit is ${MAX_STEPS}. Split the task into two articles.`)
          current().blocks.push({ t: 'steps', items })
        } else current().blocks.push({ t: 'list', items })
        break
      }
      case 'blockquote': {
        const q = tok as Tokens.Blockquote
        const paras: GuideInline[][] = []
        for (const child of q.tokens) {
          if (child.type === 'paragraph') paras.push(inlines((child as Tokens.Paragraph).tokens, errors))
          else if (child.type !== 'space') errors.push(`unsupported ${child.type} inside a callout`)
        }
        current().blocks.push({ t: 'callout', c: paras })
        break
      }
      case 'html':
        errors.push(`raw HTML is not allowed: ${(tok as Tokens.HTML).text.trim().slice(0, 40)}`)
        break
      default:
        errors.push(`unsupported markdown block: ${tok.type}`)
    }
  }
  if (sections[0]!.blocks.length === 0) errors.push('needs a short intro (one or two sentences) before the first H2')

  const article: GuideArticle = {
    id: f.id,
    title: f.title,
    summary: f.summary,
    topic: f.topic,
    roles: f.roles,
    routes: f.routes,
    primaryRoute: f.primary_route,
    keywords: f.keywords,
    shots: f.shots,
    related: f.related,
    reviewed: f.reviewed,
    sections: sections.filter((s) => s.heading !== null || s.blocks.length > 0),
    source,
  }
  return { article, errors }
}

export function inlineText(nodes: GuideInline[]): string {
  return nodes
    .map((n) => {
      switch (n.t) {
        case 'text':
        case 'code':
          return n.v
        case 'ui':
          return n.label
        case 'strong':
        case 'em':
        case 'link':
          return inlineText(n.c)
      }
    })
    .join('')
}

export function blocksText(blocks: GuideBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.t) {
        case 'p':
          return inlineText(b.c)
        case 'list':
        case 'steps':
          return b.items.map(inlineText).join('\n')
        case 'callout':
          return b.c.map(inlineText).join('\n')
        case 'h3':
          return b.text
        case 'shot':
          return ''
      }
    })
    .filter(Boolean)
    .join('\n')
}

/** Every inline node of an article (for label / link checks). */
export function walkInlines(article: GuideArticle, visit: (n: GuideInline) => void): void {
  const walk = (ns: GuideInline[]) => {
    for (const n of ns) {
      visit(n)
      if (n.t === 'strong' || n.t === 'em' || n.t === 'link') walk(n.c)
    }
  }
  for (const s of article.sections) {
    for (const b of s.blocks) {
      if (b.t === 'p') walk(b.c)
      else if (b.t === 'list' || b.t === 'steps' || b.t === 'callout') (b.t === 'callout' ? b.c : b.items).forEach(walk)
    }
  }
}

export interface CompiledGuide {
  articles: GuideArticle[]
  sections: GuideSection[]
  routeIndex: Record<string, string[]>
  searchIndex: GuideSearchIndex
  topics: GuideTopic[]
  paths: GuidePath[]
  /** From docs/releases `whats_new:` blocks, newest first (spec §6.5). */
  whatsNew: WhatsNewEntry[]
  /** `file: message` */
  errors: string[]
}

export function compileGuide(
  files: { path: string; src: string }[],
  rawMeta: unknown,
  releaseNotes: { file: string; src: string }[] = [],
): CompiledGuide {
  const errors: string[] = []
  const metaParse = MetaSchema.safeParse(rawMeta)
  const meta = metaParse.success ? metaParse.data : { topics: [], paths: [] }
  if (!metaParse.success) for (const i of metaParse.error.issues) errors.push(`_meta.yaml: ${i.path.join('.')}: ${i.message}`)

  const articles: GuideArticle[] = []
  const seen = new Map<string, string>()
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const { article, errors: errs } = compileArticle(file.src, file.path)
    for (const e of errs) errors.push(`${file.path}: ${e}`)
    if (!article) continue
    const dup = seen.get(article.id)
    if (dup) {
      errors.push(`${file.path}: duplicate article id "${article.id}" (also in ${dup})`)
      continue
    }
    seen.set(article.id, file.path)
    articles.push(article)
  }

  const topicOrder = new Map(meta.topics.map((t, i) => [t.id, i]))
  const ids = new Set(articles.map((a) => a.id))
  for (const a of articles) {
    if (!topicOrder.has(a.topic)) errors.push(`${a.source}: unknown topic "${a.topic}" (add it to _meta.yaml)`)
    for (const r of a.related) if (!ids.has(r)) errors.push(`${a.source}: related article "${r}" does not exist`)
    walkInlines(a, (n) => {
      if (n.t === 'link' && n.kind === 'guide' && !ids.has(n.href)) errors.push(`${a.source}: guide link to unknown article "${n.href}"`)
    })
  }
  for (const p of meta.paths) for (const id of p.articles) if (!ids.has(id)) errors.push(`_meta.yaml: path "${p.id}" lists unknown article "${id}"`)

  articles.sort((a, b) => (topicOrder.get(a.topic) ?? 99) - (topicOrder.get(b.topic) ?? 99) || a.id.localeCompare(b.id))

  const sections: GuideSection[] = articles.flatMap((a) =>
    a.sections.map((s) => ({
      articleId: a.id,
      sectionId: s.id,
      heading: s.heading ?? a.title,
      text: blocksText(s.blocks),
      roles: a.roles,
      routes: a.routes,
    })),
  )

  const routeIndex: Record<string, string[]> = {}
  for (const route of [...new Set(articles.flatMap((a) => a.routes))].sort()) {
    routeIndex[route] = articles.filter((a) => a.routes.includes(route)).map((a) => a.id)
  }

  const searchIndex: GuideSearchIndex = {
    articles: buildBm25(
      articles.map((a) => ({
        id: a.id,
        fields: [
          { text: a.title, weight: 3 },
          { text: a.keywords.join(' '), weight: 2 },
          { text: a.summary, weight: 1 },
        ],
      })),
    ),
    sections: buildBm25(
      sections.map((s) => ({
        id: `${s.articleId}#${s.sectionId}`,
        fields: [
          { text: s.heading, weight: 2 },
          { text: s.text, weight: 1 },
        ],
      })),
    ),
  }

  const whatsNew = compileWhatsNew(releaseNotes, ids)
  errors.push(...whatsNew.errors)

  return { articles, sections, routeIndex, searchIndex, topics: meta.topics, paths: meta.paths, whatsNew: whatsNew.entries, errors }
}

export function emitModule(g: CompiledGuide): string {
  const j = (v: unknown) => JSON.stringify(v, null, 2)
  return [
    '// GENERATED by scripts/guide-build.ts from apps/hoa/content/guide. Do not edit.',
    '// Regenerate with `pnpm guide:build`; CI fails when this file is stale.',
    '/* eslint-disable */',
    "import type { GuideArticle, GuidePath, GuideSearchIndex, GuideSection, GuideTopic, WhatsNewEntry } from '../lib/guide/types'",
    '',
    `export const GUIDE_TOPICS: readonly GuideTopic[] = ${j(g.topics)}`,
    '',
    `export const GUIDE_PATHS: readonly GuidePath[] = ${j(g.paths)}`,
    '',
    `export const GUIDE_ARTICLES: readonly GuideArticle[] = ${j(g.articles)}`,
    '',
    `export const GUIDE_SECTIONS: readonly GuideSection[] = ${j(g.sections)}`,
    '',
    '/** Route template -> article ids (the "?" drawer and the Ask deep-link allowlist). */',
    `export const GUIDE_ROUTE_INDEX: Readonly<Record<string, readonly string[]>> = ${j(g.routeIndex)}`,
    '',
    `export const GUIDE_SEARCH_INDEX: GuideSearchIndex = ${JSON.stringify(g.searchIndex)}`,
    '',
    "/** What's new entries from docs/releases `whats_new:` blocks, newest first. */",
    `export const WHATS_NEW: readonly WhatsNewEntry[] = ${j(g.whatsNew)}`,
    '',
  ].join('\n')
}
