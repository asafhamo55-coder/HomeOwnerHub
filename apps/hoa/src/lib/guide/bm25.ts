/**
 * Our own ~100-line BM25 (spec §5.1): the index is built at compile time by
 * scripts/guide-build.ts and written into src/generated/guide.ts; the app
 * only scores queries against it. No dependency, no fs, works in the
 * browser (instant search) and on the server (full-text search).
 */
import type { Bm25Index } from './types'
import { lastWord, stem, synonymsOf, tokenize } from './text'

export interface Bm25Doc {
  id: string
  /** Each field's tokens count `weight` times (title 3, keywords 2, body 1). */
  fields: { text: string; weight: number }[]
}

export function buildBm25(docs: Bm25Doc[]): Bm25Index {
  const ids: string[] = []
  const lengths: number[] = []
  const map = new Map<string, Map<number, number>>()
  docs.forEach((doc, i) => {
    ids.push(doc.id)
    let len = 0
    for (const f of doc.fields) {
      for (const tok of tokenize(f.text)) {
        len += f.weight
        let p = map.get(tok)
        if (!p) map.set(tok, (p = new Map()))
        p.set(i, (p.get(i) ?? 0) + f.weight)
      }
    }
    lengths.push(len)
  })
  const postings: Record<string, [number, number][]> = {}
  for (const term of [...map.keys()].sort()) {
    postings[term] = [...map.get(term)!.entries()].sort((a, b) => a[0] - b[0])
  }
  const total = lengths.reduce((a, b) => a + b, 0)
  return { ids, lengths, avgLength: docs.length ? Math.round((total / docs.length) * 1000) / 1000 : 0, postings }
}

export interface Bm25Hit {
  id: string
  score: number
}

export interface Bm25SearchOptions {
  /** Treat the last word as a prefix (instant search while typing). */
  prefixLast?: boolean
  /** Only return these ids (role filter). */
  allow?: ReadonlySet<string>
  limit?: number
}

const K1 = 1.2
const B = 0.75
const SYNONYM_WEIGHT = 0.6
const PREFIX_WEIGHT = 0.8

export function searchBm25(index: Bm25Index, query: string, opts: Bm25SearchOptions = {}): Bm25Hit[] {
  // term -> query weight (the strongest reason it is in the query wins)
  const terms = new Map<string, number>()
  const add = (t: string, w: number) => terms.set(t, Math.max(terms.get(t) ?? 0, w))
  for (const t of tokenize(query)) {
    add(t, 1)
    for (const s of synonymsOf(t)) add(s, SYNONYM_WEIGHT)
  }
  if (opts.prefixLast) {
    const raw = lastWord(query)
    if (raw && raw.length >= 3) {
      const stemmed = stem(raw)
      for (const key of Object.keys(index.postings)) {
        if (key.startsWith(raw) || key.startsWith(stemmed)) add(key, key === stemmed ? 1 : PREFIX_WEIGHT)
      }
    }
  }
  if (terms.size === 0) return []

  const n = index.ids.length
  const scores = new Map<number, number>()
  for (const [term, qw] of terms) {
    const plist = index.postings[term]
    if (!plist) continue
    const idf = Math.log(1 + (n - plist.length + 0.5) / (plist.length + 0.5))
    for (const [doc, tf] of plist) {
      const len = index.lengths[doc] ?? 0
      const norm = tf + K1 * (1 - B + (B * len) / (index.avgLength || 1))
      scores.set(doc, (scores.get(doc) ?? 0) + qw * idf * ((tf * (K1 + 1)) / norm))
    }
  }
  const hits: Bm25Hit[] = []
  for (const [doc, score] of scores) {
    const id = index.ids[doc]!
    if (opts.allow && !opts.allow.has(id)) continue
    hits.push({ id, score })
  }
  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  return hits.slice(0, opts.limit ?? 20)
}
