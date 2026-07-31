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

/**
 * Gmail sometimes wraps a long "On <date>, <person> wrote:" attribution
 * across two or three lines, splitting mid-sentence (often right before
 * the sender name or "wrote:" itself). The single-line form is already
 * matched directly by CUT_PATTERNS above; this checks whether joining the
 * current line with the next one or two lines completes the same
 * "wrote:" terminator.
 *
 * We deliberately key on the literal "wrote:" terminator rather than on
 * an incidental word like "at" — "at" shows up constantly in ordinary
 * prose ("On arrival at the gate...", "On Saturdays at the pool...", "On
 * the topic at hand...") and matching on it would cut a resident's
 * message at its very first line. "wrote:" is the actual, reliable
 * signal that this is an attribution line, wrapped or not.
 */
function isWrappedOnWroteAttribution(lines: string[], i: number): boolean {
  if (!/^On /i.test(lines[i].trim())) return false
  for (let span = 2; span <= 3; span++) {
    const joined = lines
      .slice(i, i + span)
      .map((l) => l.trim())
      .join(' ')
    if (/^On .*wrote:\s*$/i.test(joined)) return true
  }
  return false
}

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

    // Wrapped "On ... wrote:" attribution spanning the next 1-2 lines.
    if (isWrappedOnWroteAttribution(working, i)) {
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
