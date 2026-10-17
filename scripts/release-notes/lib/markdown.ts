// A deliberately small Markdown subset for release notes, rendered to
// email-safe HTML with inline styles: `### sub-heading`, `-`/`*` bullets,
// paragraphs, **bold**, *italic*, `code` and [links](https://...).
//
// Everything is escaped first, so a note cannot inject markup into the
// email. Links are limited to http(s) and mailto.

import { BRAND } from './brand'

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function inline(text: string): string {
  let s = escapeHtml(text)
  s = s.replace(
    /`([^`]+)`/g,
    `<code style="font-family:${BRAND.mono};font-size:13px;background-color:${BRAND.subtle};border-radius:4px;padding:1px 4px;color:${BRAND.foreground};">$1</code>`,
  )
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  s = s.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g, (_m, label: string, href: string) => {
    return `<a href="${href}" style="color:${BRAND.primary};text-decoration:underline;">${label}</a>`
  })
  return s
}

/** Plain-text form of an inline string, for the text/plain part. */
export function inlineText(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1$2')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
}

type Block =
  | { kind: 'h3'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }

export function parseBlocks(md: string): Block[] {
  const blocks: Block[] = []
  let para: string[] = []
  let list: string[] | null = null
  const flushPara = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join(' ') })
    para = []
  }
  const flushList = () => {
    if (list?.length) blocks.push({ kind: 'ul', items: list })
    list = null
  }
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flushPara()
      flushList()
      continue
    }
    const h = /^###\s+(.+)$/.exec(line)
    if (h) {
      flushPara()
      flushList()
      blocks.push({ kind: 'h3', text: h[1]!.trim() })
      continue
    }
    const li = /^\s*[-*]\s+(.+)$/.exec(line)
    if (li) {
      flushPara()
      list ??= []
      list.push(li[1]!.trim())
      continue
    }
    if (list && /^\s{2,}\S/.test(raw)) {
      // Continuation line of the previous bullet.
      list[list.length - 1] += ' ' + line.trim()
      continue
    }
    flushList()
    para.push(line.trim())
  }
  flushPara()
  flushList()
  return blocks
}

export function blocksToHtml(md: string): string {
  return parseBlocks(md)
    .map((b) => {
      if (b.kind === 'h3') {
        return `<h3 style="margin:18px 0 6px 0;font-size:14px;line-height:20px;font-weight:600;color:${BRAND.foreground};">${inline(b.text)}</h3>`
      }
      if (b.kind === 'p') {
        return `<p style="margin:0 0 12px 0;font-size:15px;line-height:24px;color:${BRAND.foregroundSecondary};">${inline(b.text)}</p>`
      }
      const items = b.items
        .map(
          (i) =>
            `<li style="margin:0 0 6px 0;font-size:15px;line-height:23px;color:${BRAND.foregroundSecondary};">${inline(i)}</li>`,
        )
        .join('')
      return `<ul style="margin:0 0 12px 0;padding:0 0 0 20px;">${items}</ul>`
    })
    .join('\n')
}

export function blocksToText(md: string): string {
  return parseBlocks(md)
    .map((b) => {
      if (b.kind === 'h3') return `${inlineText(b.text)}:`
      if (b.kind === 'p') return inlineText(b.text)
      return b.items.map((i) => `  - ${inlineText(i)}`).join('\n')
    })
    .join('\n\n')
}
