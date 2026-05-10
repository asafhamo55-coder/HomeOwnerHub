// Chunking strategies for W1.
//
// Two flavors:
//  - chunkByMarkdownSection — for parsed markdown / structured input.
//    Walks H2 (Article) and H3 (Section) headings; each chunk gets the
//    H3 heading as its `section` and the parent H2 prepended for context.
//  - chunkPlainText — for raw extracted text (PDFs, OCR'd notes). Splits
//    by paragraph then packs into ~1000-char windows with 100-char
//    overlap. Tries to detect Article/Section labels in the text and
//    promote them to the chunk's section field; otherwise falls back to
//    the first ~80 chars of the chunk as a synthetic label.

export interface Chunk {
  section: string
  text: string
}

const TARGET_CHARS = 1000
const OVERLAP_CHARS = 120
const MAX_CHARS = 1500 // hard cap so a single huge paragraph doesn't blow context

const SECTION_PATTERNS = [
  /\b(Article\s+[IVXLCDM]+|Article\s+\d+)/i,
  /\b(Section\s+\d+(?:\.\d+)*)/i,
  /\b(Rule\s+\d+(?:\.\d+)*)/i,
]

export function chunkByMarkdownSection(markdown: string): Chunk[] {
  const lines = markdown.split('\n')
  const chunks: Chunk[] = []
  let currentArticle = ''
  let currentSection: { section: string; lines: string[] } | null = null

  const flush = (): void => {
    if (currentSection && currentSection.lines.length > 0) {
      const body = currentSection.lines.join('\n').trim()
      if (body.length > 0) {
        chunks.push({
          section: currentSection.section,
          text: `${currentArticle ? currentArticle + '\n\n' : ''}${body}`,
        })
      }
    }
    currentSection = null
  }

  for (const line of lines) {
    if (line.startsWith('# ')) continue
    if (line.startsWith('## ')) {
      flush()
      currentArticle = line.slice(3).trim()
      continue
    }
    if (line.startsWith('### ')) {
      flush()
      const heading = line.slice(4).trim()
      currentSection = { section: heading, lines: [heading] }
      continue
    }
    if (currentSection) currentSection.lines.push(line)
  }
  flush()
  return chunks
}

export function chunkPlainText(raw: string): Chunk[] {
  const normalized = raw
    .replace(/\r\n/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n')
    .trim()
  if (normalized.length === 0) return []

  // Split on blank lines (paragraph boundaries).
  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const chunks: Chunk[] = []
  let buffer: string[] = []
  let bufferLen = 0

  const flush = (): void => {
    if (buffer.length === 0) return
    const text = buffer.join('\n\n').trim()
    if (text.length === 0) return
    chunks.push({
      section: detectSection(text) ?? synthLabel(text),
      text,
    })
    buffer = []
    bufferLen = 0
  }

  for (const para of paragraphs) {
    // If a single paragraph blows MAX, hard-split it on sentence boundaries.
    if (para.length > MAX_CHARS) {
      flush()
      for (const piece of splitOversize(para)) {
        chunks.push({
          section: detectSection(piece) ?? synthLabel(piece),
          text: piece,
        })
      }
      continue
    }

    if (bufferLen + para.length + 2 > TARGET_CHARS && buffer.length > 0) {
      flush()
      // Carry an overlap tail from the previous chunk's last paragraph
      // into the new buffer so context isn't fully lost.
      const tail = chunks.at(-1)?.text.slice(-OVERLAP_CHARS) ?? ''
      if (tail) {
        buffer.push(tail)
        bufferLen += tail.length
      }
    }
    buffer.push(para)
    bufferLen += para.length + 2
  }
  flush()
  return chunks
}

function detectSection(text: string): string | null {
  // Look only in the first 200 chars — section labels typically lead.
  const head = text.slice(0, 200)
  for (const pattern of SECTION_PATTERNS) {
    const match = pattern.exec(head)
    if (match) return match[1]
  }
  return null
}

function synthLabel(text: string): string {
  const firstLine = text.split('\n')[0] ?? ''
  return firstLine.length <= 80
    ? firstLine
    : `${firstLine.slice(0, 80).trim()}…`
}

function splitOversize(para: string): string[] {
  const sentences = para.split(/(?<=[.!?])\s+/)
  const out: string[] = []
  let current = ''
  for (const s of sentences) {
    if (current.length + s.length + 1 > TARGET_CHARS && current.length > 0) {
      out.push(current.trim())
      current = ''
    }
    current += (current ? ' ' : '') + s
  }
  if (current.trim()) out.push(current.trim())
  return out
}
