/**
 * The agenda / minutes text split into paragraphs for the meeting page.
 * A blank line starts a new paragraph — except inside a list: numbered or
 * bulleted lines separated by a stray blank line (meeting-detail--375:
 * a gap between agenda items 3 and 4) stay one block, so the items are
 * evenly spaced.
 */
const LIST_LINE = /^\s*(?:\d+[.)]|[-*•])\s+/

function isList(para: string): boolean {
  const lines = para.split('\n').filter((l) => l.trim())
  return lines.length > 0 && lines.every((l) => LIST_LINE.test(l))
}

export function minutesBlocks(text: string): string[] {
  const paras = text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^\n+|\s+$/g, ''))
    .filter((p) => p.trim())
  const out: string[] = []
  for (const p of paras) {
    const prev = out[out.length - 1]
    if (prev !== undefined && isList(prev) && isList(p)) out[out.length - 1] = `${prev}\n${p}`
    else out.push(p)
  }
  return out
}
