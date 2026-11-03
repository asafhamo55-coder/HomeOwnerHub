// Everything the chat may answer from: marketing pages, the guides, the
// in-app help articles, and a few hand-written support facts. Nothing else is
// ever sent to the model. Relative imports only: tests import this module.

import { APP_ORIGIN } from '../app-origin'
import { FEATURE_PAGES, featurePath } from '../feature-pages'
import { ALL_GUIDES, pathOf } from '../georgia'
import { HOA_PLANS, HOA_PRICE_COPY } from '../hoa-pricing'
import { HOME_FAQS } from '../home-faq'
import { PAGE_META } from '../page-meta'
import { GEORGIA_FEATURES, GEORGIA_SCOPE_NOTE, STATE_HUBS } from '../state-law'
import { buildIndex, search, type Bm25Hit, type Bm25Index, type Passage } from './bm25'
import { FACTS } from './facts'
import { HELP_ARTICLES } from './help-articles.generated'

const MAX_PASSAGE_CHARS = 1400

const clip = (s: string) => (s.length > MAX_PASSAGE_CHARS ? `${s.slice(0, MAX_PASSAGE_CHARS)}...` : s)

export function buildPassages(): Passage[] {
  const out: Passage[] = []

  for (const [path, meta] of Object.entries(PAGE_META)) {
    out.push({ id: `page:${path}`, title: meta.title, url: path, text: meta.description, kind: 'page' })
  }

  out.push({
    id: 'pricing:plans',
    title: 'How much HomeownerHub costs: pricing and plans',
    url: '/pricing',
    kind: 'page',
    text: clip(
      [
        HOA_PRICE_COPY.summary,
        HOA_PRICE_COPY.minimum,
        HOA_PRICE_COPY.contract,
        ...HOA_PLANS.map((p) => `${p.name}: ${p.price} ${p.period}. ${p.sub}`),
      ].join(' '),
    ),
  })

  HOME_FAQS.forEach((f, i) =>
    out.push({ id: `faq:home:${i}`, title: f.q, url: '/', text: clip(f.a), kind: 'page' }),
  )

  for (const f of FEATURE_PAGES) {
    out.push({
      id: `feature:${f.slug}`,
      title: `${f.label} (feature)`,
      url: featurePath(f.slug),
      kind: 'page',
      text: clip([f.subhead, ...f.benefits.map((b) => `${b.title}. ${b.body}`)].join(' ')),
    })
  }

  for (const h of STATE_HUBS) {
    out.push({
      id: `state:${h.slug}`,
      title: `${h.name} HOA law in HomeownerHub`,
      url: `/states/${h.slug}`,
      kind: 'page',
      text: clip(
        [h.lead, ...h.statutes, ...h.features.map((x) => `${x.item}. ${x.body}`), ...h.caveats].join(' '),
      ),
    })
  }

  out.push({
    id: 'georgia:features',
    title: 'Georgia HOA law: what HomeownerHub follows',
    url: '/georgia',
    kind: 'page',
    text: clip(
      [GEORGIA_SCOPE_NOTE, ...GEORGIA_FEATURES.map((f) => `${f.title} (${f.citation}). ${f.body}`)].join(' '),
    ),
  })

  for (const g of ALL_GUIDES) {
    out.push({
      id: `guide:${g.slug}`,
      title: g.title,
      url: pathOf(g),
      kind: 'guide',
      text: clip(
        [g.description, ...g.summary, ...g.faqs.map((f) => `${f.q} ${f.a}`)].join(' '),
      ),
    })
  }

  for (const a of HELP_ARTICLES) {
    out.push({
      id: `help:${a.id}`,
      title: a.title,
      url: `${APP_ORIGIN}/help/${a.id}`,
      kind: 'help',
      text: clip(`${a.summary} ${a.text}`),
    })
  }

  for (const f of FACTS) {
    out.push({ id: `fact:${f.id}`, title: f.title, url: f.url, text: f.text, kind: 'fact' })
  }

  return out
}

let cached: Bm25Index | null = null

export function getIndex(): Bm25Index {
  return (cached ??= buildIndex(buildPassages()))
}

/** The best passages for a question. Weak matches are dropped. */
export function retrieve(query: string, limit = 5): Bm25Hit[] {
  const hits = search(getIndex(), query, limit)
  const top = hits[0]?.score ?? 0
  return hits.filter((h) => h.score >= top * 0.35)
}
