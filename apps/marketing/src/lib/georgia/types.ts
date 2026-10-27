// The shape of a Georgia guide. Guides are data, not hand-built pages, so one
// layout renders them all and the tests can walk every claim: each quote is
// checked word for word against a fixture, each "what HomeownerHub does"
// line names an apps/hoa route and a release note that exist.
//
// No "@/..." imports: marketing-truth tests import these modules, and the
// root vitest config maps "@" to apps/hoa.

import type { QuoteId } from '../georgia-quotes'

export interface GuideSection {
  heading: string
  /** Plain-language paragraphs. */
  body: string[]
  /** Optional bullet list after the paragraphs. */
  list?: string[]
  /** Verbatim statute quotes shown after the text. */
  quotes?: QuoteId[]
}

export interface HoaDoes {
  text: string
  /** apps/hoa page a board uses. Dynamic segments as [id]. */
  route: string
  /** docs/releases/<release>.md that announced it. */
  release: string
}

export interface Guide {
  slug: string
  /** H1. */
  title: string
  /** <title> without the site suffix. */
  metaTitle: string
  description: string
  /** Short label above the H1. */
  eyebrow: string
  /** ISO dates, for Article JSON-LD and the sitemap. */
  datePublished: string
  dateModified: string
  /** Three or four takeaways shown first. */
  summary: string[]
  sections: GuideSection[]
  /** "What to do next", in order. */
  steps: string[]
  faqs: { q: string; a: string }[]
  /** Slugs of related pages (guides, checklists, readiness check). */
  related: string[]
  /** What HomeownerHub does about this topic: only what has shipped. */
  hoaDoes: HoaDoes[]
  /** Said when HomeownerHub does not cover the topic (yet). */
  hoaDoesNot?: string
  /** Pages outside /georgia (BL-172 batch 2): the page's own path. Default /georgia/<slug>. */
  path?: string
  /** Emit HowTo JSON-LD built from `steps`. */
  howTo?: boolean
}

/** A page in the Georgia section, for link lists. */
export interface GeorgiaLink {
  slug: string
  path: string
  title: string
  blurb: string
  kind: 'guide' | 'tool'
}
