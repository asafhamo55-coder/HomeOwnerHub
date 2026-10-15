import { createHash } from 'node:crypto'

/**
 * Canonical form of a statute body. content_hash is computed over this,
 * and this is also exactly what gets stored in state_statutes.body, so a
 * stored row can always be re-hashed to the value the job would compute.
 *
 * Only presentation is normalised — never wording:
 *   - Unicode NFC (the same character can arrive composed or decomposed)
 *   - every whitespace run, including the source's em/en spaces and
 *     non-breaking spaces, becomes one ASCII space
 *   - each line is trimmed, blank lines are dropped, and the remaining
 *     lines (one per subsection/paragraph) are joined by a blank line, which
 *     is the paragraph boundary chunkPlainText splits on.
 *
 * Quotes, dashes and punctuation are kept as published: "verbatim" means a
 * quote taken from this text occurs in the official text.
 */
export function normalizeStatuteBody(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    // JS `\s` already covers NBSP, U+2000–U+200A (em/en spaces), U+202F,
    // U+205F, U+3000 and U+FEFF. Zero-width spaces are dropped, not spaced.
    .map((line) => line.replace(/[​﻿]/g, '').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n\n')
}

/** SHA-256 (hex) of the normalised body. */
export function statuteContentHash(body: string): string {
  return createHash('sha256').update(normalizeStatuteBody(body), 'utf8').digest('hex')
}
