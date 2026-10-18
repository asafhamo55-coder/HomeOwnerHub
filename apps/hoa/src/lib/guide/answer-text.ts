/**
 * Splits a validated "Ask the guide" answer into renderable pieces: plain
 * text, `[n]` citation markers and `[[Label]]` control chips, grouped into
 * paragraphs and numbered steps. The server already removed anything
 * unproven (ask-core.ts); this only shapes what is left for React, so the
 * UI never needs dangerouslySetInnerHTML.
 */

export type AnswerPiece = { t: 'text'; v: string } | { t: 'cite'; n: number } | { t: 'ui'; label: string }
export type AnswerBlock = { t: 'p'; pieces: AnswerPiece[] } | { t: 'steps'; items: AnswerPiece[][] }

const TOKEN = /\[\[([^\]\n]{1,80})\]\]|\[(\d{1,2})\]/g

export function answerPieces(line: string): AnswerPiece[] {
  const out: AnswerPiece[] = []
  let last = 0
  for (const m of line.matchAll(TOKEN)) {
    if (m.index! > last) out.push({ t: 'text', v: line.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ t: 'ui', label: m[1] })
    else out.push({ t: 'cite', n: Number(m[2]) })
    last = m.index! + m[0].length
  }
  if (last < line.length) out.push({ t: 'text', v: line.slice(last) })
  return out
}

const STEP = /^\s*\d{1,2}[.)]\s+/

export function answerBlocks(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (STEP.test(line)) {
      const item = answerPieces(line.replace(STEP, ''))
      const prev = blocks[blocks.length - 1]
      if (prev?.t === 'steps') prev.items.push(item)
      else blocks.push({ t: 'steps', items: [item] })
    } else {
      blocks.push({ t: 'p', pieces: answerPieces(line.replace(/^[-*]\s+/, '')) })
    }
  }
  return blocks
}
