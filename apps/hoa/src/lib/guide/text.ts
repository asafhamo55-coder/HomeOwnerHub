/**
 * Tokenizer shared by the guide compiler (build time) and guide search
 * (runtime). Both sides MUST use this one module: an index built with one
 * stemmer and queried with another silently finds nothing.
 */

const STOPWORDS = new Set(
  (
    'a an the and or of to in on for how do does did i is it its my me can could what when where which who why ' +
    'with by at be this that these those from you your we our us are was were as if so not no yes am ' +
    'about into there their they them then than just get got will would should here'
  ).split(' '),
)

/** A deliberately small suffix stripper. Stable beats clever here. */
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
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1)
}

/** Lowercased, accent-folded, stopword-free, stemmed tokens. */
export function tokenize(text: string): string[] {
  return words(text)
    .filter((w) => !STOPWORDS.has(w))
    .map(stem)
}

/**
 * Words people type -> words the guide uses. Keys and values are plain
 * words; they are stemmed on use. Article `keywords` cover article-specific
 * synonyms; this table is for vocabulary that cuts across the whole app.
 */
const SYNONYMS: Record<string, string[]> = {
  cheque: ['check'],
  assessment: ['dues'],
  assessments: ['dues'],
  fee: ['dues'],
  fees: ['dues'],
  hoa: ['association'],
  house: ['property', 'home'],
  home: ['property'],
  unit: ['property'],
  lot: ['property'],
  owner: ['resident'],
  homeowner: ['resident', 'owner'],
  tenant: ['resident'],
  notice: ['letter', 'violation'],
  fine: ['violation'],
  architectural: ['arc'],
  modification: ['arc'],
  minutes: ['meeting'],
  agenda: ['meeting'],
  announcement: ['communication'],
  newsletter: ['communication', 'announcement'],
  text: ['sms'],
  ccr: ['governing', 'covenant'],
  ccrs: ['governing', 'covenant'],
  bylaws: ['governing'],
  rules: ['governing'],
  invite: ['member'],
  pay: ['payment'],
  paid: ['payment'],
  bill: ['invoice', 'charge'],
}

const STEMMED_SYNONYMS: Map<string, string[]> = new Map()
for (const [k, vs] of Object.entries(SYNONYMS)) {
  const key = stem(k)
  const prev = STEMMED_SYNONYMS.get(key) ?? []
  STEMMED_SYNONYMS.set(key, [...new Set([...prev, ...vs.flatMap((v) => tokenize(v))])])
}

/** Query tokens plus their synonyms (stemmed, de-duplicated). */
export function expandQuery(query: string): string[] {
  const out = new Set<string>()
  for (const t of tokenize(query)) {
    out.add(t)
    for (const s of STEMMED_SYNONYMS.get(t) ?? []) out.add(s)
  }
  return [...out]
}

/** Synonyms of one stemmed token (exported for the scorer). */
export function synonymsOf(token: string): string[] {
  return STEMMED_SYNONYMS.get(token) ?? []
}

/** The last word as typed (lowercased, accent-folded), for prefix search. */
export function lastWord(query: string): string | null {
  const ws = words(query)
  return ws.length ? ws[ws.length - 1]! : null
}
