// Parse docs/owner-actions.md into open and done items.
//
// Format (docs/owner-actions.md "For Claude: keeping this file current"):
//
//   ## Open
//   ### OA-1 · Title
//   **Urgency:** Urgent | Soon | Whenever
//   ...body markdown...
//   ## Done
//   ### OA-7 · Title
//   **Done:** 2026-10-21
//
// Every other `##` section is prose. "Why these need you" is kept so the
// email can repeat it. A malformed item throws: a checklist that silently
// drops a step is worse than no email.

import { createHash } from 'node:crypto'

export const URGENCIES = ['Urgent', 'Soon', 'Whenever'] as const
export type Urgency = (typeof URGENCIES)[number]

export interface ActionItem {
  id: string
  /** The number in the id, for ordering and duplicate checks. */
  n: number
  title: string
  /** Required for open items; optional for done ones. */
  urgency: Urgency | null
  /** Markdown body with the Urgency / Done lines removed. */
  body: string
  doneOn: string | null
}

export interface OwnerActions {
  /** Sorted Urgent, then Soon, then Whenever; file order within a tier. */
  open: ActionItem[]
  done: ActionItem[]
  /** The "Why these need you" section, if present. */
  why: string | null
}

export class OwnerActionsFormatError extends Error {}

const HEADING = /^###\s+(OA-(\d+))\s*[·:\-–—]\s*(.+?)\s*$/
const URGENCY_LINE = /^\*\*Urgency:\*\*\s*(.+?)\s*$/i
const DONE_LINE = /^\*\*Done:\*\*\s*(.+?)\s*$/i

function splitSections(md: string): Map<string, string> {
  const sections = new Map<string, string>()
  let name: string | null = null
  let buf: string[] = []
  const flush = () => {
    if (name !== null) sections.set(name.toLowerCase(), buf.join('\n'))
  }
  for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line)
    if (h && !line.startsWith('###')) {
      flush()
      name = h[1]!
      buf = []
      continue
    }
    if (name !== null) buf.push(line)
  }
  flush()
  return sections
}

function parseItems(section: string, where: 'Open' | 'Done'): ActionItem[] {
  const items: ActionItem[] = []
  let cur: { id: string; n: number; title: string; lines: string[] } | null = null
  const finish = () => {
    if (!cur) return
    let urgency: Urgency | null = null
    let doneOn: string | null = null
    const body: string[] = []
    for (const line of cur.lines) {
      const u = URGENCY_LINE.exec(line.trim())
      if (u) {
        const v = URGENCIES.find((x) => x.toLowerCase() === u[1]!.replace(/\*/g, '').trim().toLowerCase())
        if (!v) throw new OwnerActionsFormatError(`${cur.id}: unknown urgency "${u[1]}" (use ${URGENCIES.join(', ')})`)
        urgency = v
        continue
      }
      const d = DONE_LINE.exec(line.trim())
      if (d) {
        doneOn = d[1]!
        continue
      }
      body.push(line)
    }
    if (where === 'Open' && !urgency) {
      throw new OwnerActionsFormatError(`${cur.id}: open item has no **Urgency:** line`)
    }
    items.push({ id: cur.id, n: cur.n, title: cur.title, urgency, body: body.join('\n').trim(), doneOn })
    cur = null
  }
  for (const line of section.split('\n')) {
    if (line.startsWith('### ')) {
      finish()
      const h = HEADING.exec(line)
      if (!h) throw new OwnerActionsFormatError(`${where}: heading is not "### OA-<n> · <title>": ${line.slice(0, 80)}`)
      cur = { id: h[1]!, n: Number(h[2]), title: h[3]!, lines: [] }
      continue
    }
    cur?.lines.push(line)
  }
  finish()
  return items
}

export function parseOwnerActions(md: string): OwnerActions {
  const sections = splitSections(md)
  const openMd = sections.get('open')
  const doneMd = sections.get('done')
  if (openMd === undefined) throw new OwnerActionsFormatError('no "## Open" section')
  if (doneMd === undefined) throw new OwnerActionsFormatError('no "## Done" section')
  const open = parseItems(openMd, 'Open')
  const done = parseItems(doneMd, 'Done')
  const seen = new Set<string>()
  for (const i of [...open, ...done]) {
    if (seen.has(i.id)) throw new OwnerActionsFormatError(`${i.id} appears more than once`)
    seen.add(i.id)
  }
  const rank = (u: Urgency | null) => URGENCIES.indexOf(u ?? 'Whenever')
  const sorted = open.map((item, idx) => ({ item, idx }))
  sorted.sort((a, b) => rank(a.item.urgency) - rank(b.item.urgency) || a.idx - b.idx)
  const why = sections.get('why these need you')?.trim() || null
  return { open: sorted.map((s) => s.item), done, why }
}

export function countUrgent(items: readonly ActionItem[]): number {
  return items.filter((i) => i.urgency === 'Urgent').length
}

/**
 * Content hash of the OPEN items only (id, title, urgency, body), so edits
 * to prose or the Done section don't trigger an email. 16 hex chars.
 */
export function openItemsHash(items: readonly ActionItem[]): string {
  const canon = JSON.stringify(
    [...items]
      .sort((a, b) => a.n - b.n)
      .map((i) => [i.id, i.title, i.urgency, i.body.replace(/\s+/g, ' ').trim()]),
  )
  return createHash('sha256').update(canon).digest('hex').slice(0, 16)
}
