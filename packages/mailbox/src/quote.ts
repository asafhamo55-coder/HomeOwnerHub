/**
 * Strip quoted history from a plain-text email body.
 *
 * This is heuristic by nature — email has no reliable machine-readable
 * boundary between new content and quoted history. The rules below cover
 * Gmail, Outlook, and Apple Mail, which is effectively all HOA
 * correspondence.
 *
 * Bias: UNDER-strip rather than over-strip. Losing the resident's actual
 * question is far worse than carrying an extra quoted paragraph, so
 * anything ambiguous is left alone, and a strip that would empty the body
 * is discarded entirely.
 */

/** Markers whose appearance means "everything from here down is history". */
const CUT_PATTERNS: RegExp[] = [
  // Gmail / Apple Mail: "On <date>, <person> wrote:" — possibly wrapped
  // across lines, so we anchor on a line STARTING with "On " and ending
  // with "wrote:".
  /^On .*wrote:\s*$/i,
  // Gmail wraps long attributions; this catches the continuation form.
  /^On .*\bat\b.*$/i,
  // Outlook
  /^-{2,}\s*Original Message\s*-{2,}\s*$/i,
  /^_{5,}\s*$/,
  // Forwarded
  /^-{2,}\s*Forwarded message\s*-{2,}\s*$/i,
  // Outlook header block — "From:" immediately followed by Sent/To/Subject
  /^From:\s*.+$/i,
]

/** Lines that only continue an Outlook header block. */
const HEADER_BLOCK = /^(Sent|To|Cc|Subject|Date):\s*/i

function isQuoted(line: string): boolean {
  return line.trimStart().startsWith('>')
}

export function stripQuotedReply(bodyText: string | null): string | null {
  if (bodyText === null) return null

  const lines = bodyText.split(/\r?\n/)

  // ── bottom-posted: drop a LEADING run of quoted lines ─────────────
  let start = 0
  while (start < lines.length && (isQuoted(lines[start]) || lines[start].trim() === '')) {
    start++
  }
  // Only honour this if actual quoted lines were skipped AND content follows.
  const skippedQuoted = lines.slice(0, start).some(isQuoted)
  const working = skippedQuoted && start < lines.length ? lines.slice(start) : lines

  // ── find the first cut marker ─────────────────────────────────────
  let cut = working.length

  for (let i = 0; i < working.length; i++) {
    const line = working[i].trim()
    if (line === '') continue

    // A "From:" line only starts a quote block if a header line follows
    // within the next two lines — otherwise it is ordinary prose.
    if (/^From:\s*.+$/i.test(line)) {
      const lookahead = working.slice(i + 1, i + 3)
      if (lookahead.some((l) => HEADER_BLOCK.test(l.trim()))) {
        cut = i
        break
      }
      continue
    }

    if (CUT_PATTERNS.some((re) => re.test(line))) {
      cut = i
      break
    }

    // A quoted line with no preceding marker also ends the new content.
    if (isQuoted(working[i])) {
      cut = i
      break
    }
  }

  const kept = working.slice(0, cut).join('\n').replace(/\s+$/, '')

  // Never hand downstream an empty body — if stripping removed
  // everything, the heuristic was wrong for this message.
  return kept.trim() === '' ? bodyText.replace(/\s+$/, '') : kept
}
