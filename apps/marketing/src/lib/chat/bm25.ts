// A tiny BM25 over passages, built in memory the first time the chat route is
// hit (a few hundred short passages: milliseconds). No dependency, no vector
// store. Relative imports only: tests import this module.

const STOPWORDS = new Set(
  (
    'a an the and or of to in on for how do does did i is it its my me can could what when where which who why ' +
    'with by at be this that these those from you your we our us are was were as if so not no yes am ' +
    'about into there their they them then than just get got will would should here new'
  ).split(' '),
)

export function stem(word: string): string {
  let w = word
  if (w.length > 4 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`
  else if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1)
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3)
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2)
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1)
  return w
}

function words(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1)
}

export function tokenize(text: string): string[] {
  return words(text)
    .filter((w) => !STOPWORDS.has(w))
    .map(stem)
}

/** Words visitors type -> words our pages use. Values are stemmed on use. */
const SYNONYMS: Record<string, string[]> = {
  cost: ['price', 'pricing', 'plan'],
  pay: ['price', 'plan'],
  cheap: ['price'],
  login: ['sign', 'password'],
  cant: ['sign', 'password', 'login'],
  cannot: ['sign', 'password', 'login'],
  log: ['sign', 'password'],
  forgot: ['password', 'reset', 'sign'],
  reset: ['password', 'sign'],
  signin: ['sign', 'password'],
  locked: ['password', 'sign'],
  password: ['reset', 'sign'],
  rules: ['law', 'statute'],
  rule: ['law', 'statute'],
  legal: ['law'],
  owner: ['homeowner', 'roster'],
  list: ['roster', 'import'],
  spreadsheet: ['csv', 'import'],
  excel: ['csv', 'import'],
  upload: ['import'],
  invite: ['invitation'],
  secure: ['security'],
  safe: ['security'],
  privacy: ['security'],
}

export interface Passage {
  id: string
  title: string
  /** Path on this site, or an absolute URL (in-app help). */
  url: string
  text: string
  kind: 'page' | 'guide' | 'help' | 'fact'
}

export interface Bm25Hit {
  passage: Passage
  score: number
}

export interface Bm25Index {
  passages: readonly Passage[]
  lengths: number[]
  avg: number
  postings: Map<string, Map<number, number>>
}

const TITLE_WEIGHT = 3

export function buildIndex(passages: readonly Passage[]): Bm25Index {
  const postings = new Map<string, Map<number, number>>()
  const lengths: number[] = []
  passages.forEach((p, i) => {
    let len = 0
    const add = (text: string, weight: number) => {
      for (const tok of tokenize(text)) {
        len += weight
        let m = postings.get(tok)
        if (!m) postings.set(tok, (m = new Map()))
        m.set(i, (m.get(i) ?? 0) + weight)
      }
    }
    add(p.title, TITLE_WEIGHT)
    add(p.text, 1)
    lengths.push(len)
  })
  const total = lengths.reduce((a, b) => a + b, 0)
  return { passages, lengths, avg: passages.length ? total / passages.length : 1, postings }
}

const K1 = 1.2
const B = 0.75

export function search(index: Bm25Index, query: string, limit = 6): Bm25Hit[] {
  const terms = new Map<string, number>()
  const add = (t: string, w: number) => terms.set(t, Math.max(terms.get(t) ?? 0, w))
  for (const raw of words(query)) {
    if (!STOPWORDS.has(raw)) add(stem(raw), 1)
    for (const s of SYNONYMS[raw] ?? []) for (const t of tokenize(s)) add(t, 0.6)
  }
  const n = index.passages.length
  const scores = new Map<number, number>()
  for (const [term, qw] of terms) {
    const plist = index.postings.get(term)
    if (!plist) continue
    const idf = Math.log(1 + (n - plist.size + 0.5) / (plist.size + 0.5))
    for (const [doc, tf] of plist) {
      const norm = tf + K1 * (1 - B + (B * (index.lengths[doc] ?? 0)) / (index.avg || 1))
      scores.set(doc, (scores.get(doc) ?? 0) + qw * idf * ((tf * (K1 + 1)) / norm))
    }
  }
  return [...scores.entries()]
    .map(([doc, score]) => ({ passage: index.passages[doc]!, score }))
    .sort((a, b) => b.score - a.score || a.passage.id.localeCompare(b.passage.id))
    .slice(0, limit)
}
