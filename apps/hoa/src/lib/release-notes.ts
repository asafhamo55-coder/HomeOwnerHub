// BL-071: release notes for /whats-new, from docs/releases/*.md.
//
// Pure parsing only; the fs read lives in release-notes-server.ts. A note
// is a markdown file named `YYYY-MM-DD-slug.md` (or with `date:` / `title:`
// frontmatter). Only its `## Summary` section is shown — the rest of the
// file is for the team — falling back to the first paragraph.

export type ReleaseBlock = { type: 'p'; text: string } | { type: 'ul'; items: string[] }

export interface ReleaseNote {
  slug: string
  title: string
  /** YYYY-MM-DD, or null when neither filename nor frontmatter has one. */
  date: string | null
  summary: ReleaseBlock[]
}

const DATE_RE = /^(\d{4}-\d{2}-\d{2})/

/** Strip the inline markdown we don't render (bold, italics, code, links). */
function plain(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|`)/g, '')
    .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$|[.,;:!?])/g, '$1$2')
    .trim()
}

function toBlocks(lines: string[]): ReleaseBlock[] {
  const blocks: ReleaseBlock[] = []
  let para: string[] = []
  let list: string[] | null = null
  const flushPara = () => {
    if (para.length) blocks.push({ type: 'p', text: plain(para.join(' ')) })
    para = []
  }
  const flushList = () => {
    if (list?.length) blocks.push({ type: 'ul', items: list })
    list = null
  }
  for (const raw of lines) {
    const line = raw.trim()
    const bullet = /^[-*+]\s+(.*)$/.exec(line)
    if (bullet) {
      flushPara()
      ;(list ??= []).push(plain(bullet[1]!))
    } else if (!line) {
      flushPara()
      flushList()
    } else {
      flushList()
      para.push(line)
    }
  }
  flushPara()
  flushList()
  return blocks
}

export function parseReleaseNote(filename: string, content: string): ReleaseNote | null {
  if (!filename.endsWith('.md')) return null
  const slug = filename.slice(0, -3)
  let body = content.replace(/\r\n/g, '\n')
  const meta: Record<string, string> = {}
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(body)
  if (fm) {
    for (const l of fm[1]!.split('\n')) {
      const m = /^(\w+):\s*(.*)$/.exec(l)
      if (m) meta[m[1]!.toLowerCase()] = m[2]!.replace(/^["']|["']$/g, '').trim()
    }
    body = body.slice(fm[0].length)
  }

  const lines = body.split('\n')
  const h1 = lines.find((l) => /^#\s+/.test(l))
  const title = meta.title || (h1 ? plain(h1.replace(/^#\s+/, '')) : slug)
  const date = DATE_RE.exec(meta.date ?? '')?.[1] ?? DATE_RE.exec(filename)?.[1] ?? null

  // The `## Summary` section, up to the next heading of level ≤ 2.
  const start = lines.findIndex((l) => /^##\s+summary\s*$/i.test(l.trim()))
  let summary: ReleaseBlock[]
  if (start >= 0) {
    const rest = lines.slice(start + 1)
    const end = rest.findIndex((l) => /^#{1,2}\s/.test(l))
    summary = toBlocks(end >= 0 ? rest.slice(0, end) : rest)
  } else {
    const firstPara = toBlocks(lines.filter((l) => !/^#/.test(l))).find((b) => b.type === 'p')
    summary = firstPara ? [firstPara] : []
  }

  return { slug, title, date, summary }
}

/** Newest first; undated notes last, alphabetically. */
export function sortReleaseNotes(notes: ReleaseNote[]): ReleaseNote[] {
  return [...notes].sort((a, b) => {
    if (a.date && b.date) return a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)
    if (a.date) return -1
    if (b.date) return 1
    return a.slug.localeCompare(b.slug)
  })
}
