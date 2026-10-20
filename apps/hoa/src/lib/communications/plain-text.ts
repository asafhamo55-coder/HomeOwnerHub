/**
 * BL-102 A3: the plain-text message editor's format, and its conversion to
 * and from the HTML the send path stores.
 *
 * The board writes plain text. The body is still stored as HTML
 * (communications.body_html), but HTML that this module generated, from a
 * small, fixed tag set: <p>, <br>, <strong>, <ul>/<li> and <a href> with an
 * http(s) link. Every character the board typed is HTML-escaped first, so
 * nothing they write can become markup.
 *
 * The plain format:
 *   - a blank line starts a new paragraph; a single line break stays a line break
 *   - lines that all start with "- " make a bulleted list
 *   - **two stars** around words make them bold
 *   - a bare https:// link, or [words](https://link), becomes a link
 *   - merge fields show as friendly chips: [Resident's name], [HOA name].
 *     Any other {{ field }} (a template's own details) is kept as written.
 *
 * The reverse, htmlToPlainEditorText, only accepts HTML inside that same
 * tag set with no other attributes. Anything else (a designed community
 * template, inline styles, a table, the stored Spanish section) returns
 * null, and the editor keeps that body in Advanced (HTML) mode instead of
 * silently dropping its formatting.
 *
 * Pure and client-safe: the wizard and the server both import it.
 */

/** Merge fields the send fills for every recipient, as the board sees them. */
export const MERGE_CHIPS = [
  { field: 'recipient_name', label: "Resident's name" },
  { field: 'association_name', label: 'HOA name' },
] as const

export type MergeChip = (typeof MERGE_CHIPS)[number]

/** The token the editor shows for a chip, e.g. "[Resident's name]". */
export function chipToken(chip: MergeChip): string {
  return `[${chip.label}]`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const TRAILING_PUNCT_RE = /[.,;:!?]+$/

/** Replace chip tokens with their {{ field }} (case- and apostrophe-tolerant). */
function chipsToFields(s: string): string {
  let out = s
  for (const chip of MERGE_CHIPS) {
    const label = chip.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]")
    out = out.replace(new RegExp(`\\[${label}\\](?!\\()`, 'gi'), `{{ ${chip.field} }}`)
  }
  return out
}

/** One line of escaped inline text: bold, links, chips. */
function inlineToHtml(line: string): string {
  // Links first, on the raw text, so a URL is escaped exactly once.
  const parts: string[] = []
  const LINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s<>"'()[\]]+/g
  let last = 0
  for (const m of line.matchAll(LINK_RE)) {
    const at = m.index ?? 0
    let whole = m[0]
    let href: string
    let text: string
    if (m[1] !== undefined) {
      href = m[2]
      text = m[1]
    } else {
      const trail = whole.match(TRAILING_PUNCT_RE)?.[0] ?? ''
      whole = whole.slice(0, whole.length - trail.length)
      href = whole
      text = whole
    }
    parts.push(formatText(line.slice(last, at)))
    parts.push(`<a href="${escapeHtml(href)}">${formatText(text)}</a>`)
    last = at + whole.length
  }
  parts.push(formatText(line.slice(last)))
  return parts.join('')
}

function formatText(raw: string): string {
  const escaped = escapeHtml(chipsToFields(raw))
  return escaped.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
}

const BULLET_RE = /^\s*[-•*]\s+/

/**
 * Plain editor text → the safe HTML stored as the body. Empty or
 * whitespace-only text gives ''.
 */
export function plainTextToHtml(text: string): string {
  const blocks = text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.replace(/^\n+|\n+$/g, ''))
    .filter((b) => b.trim() !== '')
  return blocks
    .map((block) => {
      const lines = block.split('\n')
      if (lines.every((l) => BULLET_RE.test(l))) {
        return `<ul>${lines.map((l) => `<li>${inlineToHtml(l.replace(BULLET_RE, '').trim())}</li>`).join('')}</ul>`
      }
      return `<p>${lines.map((l) => inlineToHtml(l.trim())).join('<br>')}</p>`
    })
    .join('\n')
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  ndash: '–',
  mdash: '—',
  hellip: '…',
}

/** Decode the entities a body realistically holds; null on an unknown one. */
function decodeEntities(s: string): string | null {
  let ok = true
  const out = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    const v = NAMED_ENTITIES[name.toLowerCase()]
    if (v === undefined) ok = false
    return v ?? m
  })
  return ok ? out : null
}

function fieldsToChips(s: string): string {
  let out = s
  for (const chip of MERGE_CHIPS) {
    out = out.replace(new RegExp(`\\{\\{\\s*${chip.field}\\s*\\}\\}`, 'g'), chipToken(chip))
  }
  return out
}

/**
 * Stored HTML → plain editor text, or null when the HTML uses anything the
 * plain editor cannot keep (then the editor opens it in HTML mode).
 */
export function htmlToPlainEditorText(html: string): string | null {
  const source = html.trim()
  if (source === '') return ''
  const TOKEN_RE = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^>]*)?)\s*(\/?)>|<|[^<]+/g
  const blocks: string[] = []
  let current: string | null = null
  let inList = false
  let listItems: string[] = []
  let item: string | null = null
  let link: { href: string; text: string } | null = null

  const append = (s: string) => {
    if (link) link.text += s
    else if (item !== null) item += s
    else if (current !== null) current += s
    else current = s
  }
  const closeBlock = () => {
    if (current !== null && current.trim() !== '') blocks.push(current.trim())
    current = null
  }

  for (const m of source.matchAll(TOKEN_RE)) {
    const tok = m[0]
    if (tok.startsWith('<!--')) return null
    if (tok === '<') return null
    const tag = m[2]?.toLowerCase()
    if (!tag) {
      const decoded = decodeEntities(tok)
      if (decoded === null) return null
      // HTML whitespace collapses; text outside any block that is only
      // whitespace is formatting between tags.
      const text = decoded.replace(/\s+/g, ' ')
      if (current === null && item === null && !link && text.trim() === '') continue
      if (inList && item === null && text.trim() === '') continue
      if (inList && item === null) return null
      append(text)
      continue
    }
    const closing = m[1] === '/'
    const attrs = (m[3] ?? '').trim()
    if (tag === 'a') {
      if (closing) {
        if (!link) return null
        const { href, text } = link
        link = null
        append(text.trim() === href ? href : `[${text.trim()}](${href})`)
        continue
      }
      if (link) return null
      const hm = attrs.match(/^href\s*=\s*"([^"]*)"$/i) ?? attrs.match(/^href\s*=\s*'([^']*)'$/i)
      if (!hm) return null
      const href = decodeEntities(hm[1])
      if (href === null || !/^https?:\/\/[^\s<>"'()[\]]+$/.test(href)) return null
      link = { href, text: '' }
      continue
    }
    if (attrs !== '') return null
    switch (tag) {
      case 'p':
        if (inList || link) return null
        closeBlock()
        if (!closing) current = ''
        break
      case 'br':
        append('\n')
        break
      case 'strong':
      case 'b':
        append('**')
        break
      case 'ul':
        if (link || item !== null) return null
        if (!closing) {
          closeBlock()
          inList = true
          listItems = []
        } else {
          if (!inList) return null
          inList = false
          if (listItems.length > 0) blocks.push(listItems.map((i) => `- ${i}`).join('\n'))
        }
        break
      case 'li':
        if (!inList) return null
        if (!closing) {
          if (item !== null) return null
          item = ''
        } else {
          if (item === null) return null
          const text = item.replace(/\n/g, ' ').trim()
          if (text !== '') listItems.push(text)
          item = null
        }
        break
      default:
        return null
    }
  }
  if (inList || link || item !== null) return null
  closeBlock()
  // A line break followed by spaces from source indentation reads as noise.
  const text = blocks.map((b) => b.replace(/ *\n */g, '\n')).join('\n\n')
  return fieldsToChips(text)
}

/** True when the HTML is inside the plain editor's safe tag set. */
export function isPlainEditorHtml(html: string): boolean {
  return htmlToPlainEditorText(html) !== null
}

/** Typographic punctuation → plain ASCII. A curly quote or an ellipsis in a
 *  text message switches the whole SMS to UCS-2 on most carriers (70
 *  characters per part instead of 160), and some old phones show a box. */
const SMS_SAFE: Array<[RegExp, string]> = [
  [/[‘’‚‛′]/g, "'"],
  [/[“”„‟″]/g, '"'],
  [/[‐‑‒–—―]/g, '-'],
  [/…/g, '...'],
  [/[   ]/g, ' '],
  [/​/g, ''],
  [/•/g, '-'],
]

export function smsSafeText(s: string): string {
  let out = s
  for (const [re, to] of SMS_SAFE) out = out.replace(re, to)
  return out
}

/** Like decodeEntities, but leaves an unknown entity as written. */
function decodeKnownEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m) => decodeEntities(m) ?? m)
}

/**
 * Stored body HTML → the plain-text version sent alongside it: the email's
 * text part and the source of the SMS (deliver.ts renders it per recipient
 * and composeSmsBody fits it into one 279-character text, with a link to
 * the full message when it is longer).
 *
 * Unlike a bare tag strip it keeps what a reader needs: list items as "- "
 * lines, a link's address ("the notice (https://…)"), paragraphs as blank
 * lines. Punctuation is made SMS-safe (smsSafeText). Merge fields stay as
 * {{ field }} for the send to fill.
 */
export function htmlToMessageText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(
      /<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi,
      (_m, dq: string | undefined, sq: string | undefined, inner: string) => {
        const href = decodeKnownEntities((dq ?? sq ?? '').trim())
        const label = inner.replace(/<[^>]+>/g, '').trim()
        if (!/^https?:\/\//i.test(href)) return label
        return label === '' || decodeKnownEntities(label) === href ? href : `${label} (${href})`
      },
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|h[1-6]|ul|ol|section|div|table|tr|blockquote)>/gi, '\n\n')
    .replace(/<hr\s*\/?>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
  return smsSafeText(decodeKnownEntities(text))
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
