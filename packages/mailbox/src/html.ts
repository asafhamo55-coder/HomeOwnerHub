/**
 * HTML → plain text, for mail that arrives with no text/plain part.
 *
 * Apple Mail on iOS (and a few marketing senders) ship replies as
 * text/html ONLY — there is no multipart/alternative text branch to read.
 * Without this converter those messages reach the database with a null
 * body, which downstream reads as "no body at all": the thread view shows
 * "(no body)", the reply drafter retrieves an empty string, and property
 * matching loses the message text entirely.
 *
 * Deliberately regex-based and dependency-free. packages/mailbox has no
 * runtime dependencies and this is not a rendering path — the output is
 * read by a human in a <p> and by quote-stripping heuristics, so the bar
 * is "readable and correctly line-broken", not "spec-compliant HTML
 * parse". The one thing it must get right is BLOCK BOUNDARIES: emitting a
 * newline for block-level tags before stripping them is what keeps
 * `Yes<div>Signature</div>` from collapsing into `YesSignature`, and what
 * leaves an Apple Mail "On ... wrote:" attribution alone on its own line
 * where stripQuotedReply can recognise it.
 */

/** Tags whose boundaries are line breaks in the text rendering. */
const BLOCK_TAGS = [
  'address', 'article', 'aside', 'blockquote', 'br', 'dd', 'div', 'dl', 'dt',
  'fieldset', 'figure', 'footer', 'form', 'h[1-6]', 'header', 'hr', 'li',
  'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'tbody', 'td', 'tfoot',
  'th', 'thead', 'tr', 'ul',
].join('|')

const BLOCK_TAG_RE = new RegExp(`</?(?:${BLOCK_TAGS})\\b[^>]*>`, 'gi')

/**
 * Elements whose CONTENT is not body text. Dropping the whole element
 * (not just its tags) is the point — otherwise a stylesheet or a <title>
 * lands in the middle of the resident's message.
 */
const NON_CONTENT_RE = /<(script|style|head|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi

/**
 * Named entities that actually show up in mail. Anything not listed is
 * left as-is rather than guessed at — an unrecognised `&foo;` is far more
 * likely to be literal text than a rare entity.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  bull: '•',
  gt: '>',
  hellip: '…',
  ldquo: '“',
  lsquo: '‘',
  lt: '<',
  mdash: '—',
  middot: '·',
  ndash: '–',
  nbsp: ' ',
  quot: '"',
  rdquo: '”',
  rsquo: '’',
  // Zero-width padding. Marketing senders stuff hundreds of these into
  // the preheader; decoded they are invisible, undecoded they litter the
  // body with literal "&zwnj;".
  emsp: ' ',
  ensp: ' ',
  shy: '­',
  thinsp: ' ',
  zwj: '‍',
  zwnj: '‌',
}

const MAX_CODE_POINT = 0x10ffff

/**
 * Single pass by design: decoding `&amp;lt;` must yield the literal text
 * `&lt;`, not recurse into `<`. Running this AFTER tags are stripped is
 * also deliberate — decoding first would turn `&lt;script&gt;` in a
 * quoted message into something the tag-stripper then eats.
 */
function decodeEntities(text: string): string {
  return text.replace(/&(#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body.startsWith('#')) {
      const isHex = body[1] === 'x' || body[1] === 'X'
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10)
      if (!Number.isInteger(code) || code < 0 || code > MAX_CODE_POINT) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        // Lone surrogates and other unpaired code points throw; keep the
        // original text rather than dropping a character.
        return match
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match
  })
}

function normalizeWhitespace(text: string): string {
  return text
    // Apple Mail embeds a BOM mid-body; it is invisible in a mail client
    // but shows up as a stray glyph in a <p>.
    .replace(/﻿/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    // Block tags nest, so one visual blank line can emit five newlines.
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(NON_CONTENT_RE, '')
    .replace(BLOCK_TAG_RE, '\n')
    .replace(/<[^>]+>/g, '')

  return normalizeWhitespace(decodeEntities(text))
}
