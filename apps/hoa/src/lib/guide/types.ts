/**
 * Types for the compiled user guide (BL-070, docs/specs/2026-10-17-user-guide.md).
 *
 * The guide is markdown in apps/hoa/content/guide/, compiled at build time by
 * scripts/guide-build.ts into apps/hoa/src/generated/guide.ts. The app only
 * ever reads that generated module: no markdown library and no fs at runtime.
 */

export type GuideRole = 'admin' | 'board' | 'resident'

/** Inline content inside a paragraph, list item or step. */
export type GuideInline =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: GuideInline[] }
  | { t: 'em'; c: GuideInline[] }
  | { t: 'code'; v: string }
  /** `[[Label]]`: an on-screen control, rendered as a button-like chip. */
  | { t: 'ui'; label: string }
  /** `[text](/route)` (kind route) or `[text](guide:article-id)` (kind guide). */
  | { t: 'link'; kind: 'route' | 'guide'; href: string; c: GuideInline[] }

export type GuideBlock =
  | { t: 'p'; c: GuideInline[] }
  | { t: 'list'; items: GuideInline[][] }
  /** An ordered list. Inside a `Steps` section it renders as large numbered steps. */
  | { t: 'steps'; items: GuideInline[][] }
  | { t: 'h3'; text: string }
  /** `![[shot-name]]`: a guide screenshot (alt comes from the frontmatter). */
  | { t: 'shot'; name: string; alt: string }
  /** A `>` blockquote: a tip or warning box. */
  | { t: 'callout'; c: GuideInline[][] }

/** The fixed set of H2 headings an article may use (spec §4). */
export const GUIDE_SECTION_HEADINGS = [
  'Before you start',
  'Steps',
  'What happens next',
  'If something goes wrong',
  'Good to know',
] as const
export type GuideSectionHeading = (typeof GUIDE_SECTION_HEADINGS)[number]

export interface GuideArticleSection {
  /** Anchor id, e.g. `steps`, `before-you-start`; `overview` for the intro. */
  id: string
  /** Null for the intro (text before the first H2). */
  heading: string | null
  blocks: GuideBlock[]
}

export interface GuideShotRef {
  name: string
  alt: string
}

export interface GuideArticle {
  id: string
  title: string
  summary: string
  topic: string
  roles: GuideRole[]
  /** Next route templates this article is about (drives the "?" drawer). */
  routes: string[]
  /** "Take me there" target (a route template). */
  primaryRoute: string
  keywords: string[]
  shots: GuideShotRef[]
  related: string[]
  /** ISO date of the last verification against the live UI. */
  reviewed: string
  sections: GuideArticleSection[]
  /** Source file, relative to the repo root. */
  source: string
}

/** One H2 chunk, the unit of full-text search (and, later, Ask). */
export interface GuideSection {
  articleId: string
  sectionId: string
  heading: string
  text: string
  roles: GuideRole[]
  routes: string[]
}

export interface GuideTopic {
  id: string
  label: string
  description: string
}

/** A curated "Start here" list. No progress is stored (spec §3). */
export interface GuidePath {
  id: string
  label: string
  description: string
  roles: GuideRole[]
  articles: string[]
}

/** A prebuilt BM25 index (scripts/guide-build.ts writes it, bm25.ts reads it). */
export interface Bm25Index {
  /** Document ids, in posting order. */
  ids: string[]
  /** Token count (weighted) per document. */
  lengths: number[]
  avgLength: number
  /** term -> [docIndex, termFrequency] pairs. */
  postings: Record<string, [number, number][]>
}

export interface GuideSearchIndex {
  /** Titles, summaries and keywords: small enough for the client. */
  articles: Bm25Index
  /** Full section text: used on the server only. Ids are `articleId#sectionId`. */
  sections: Bm25Index
}
