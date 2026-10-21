// Parse docs/backlog.md into the items that are still left to do.
//
// The backlog is a hand-groomed document, not a fixed schema. Items appear in
// four shapes, and an id can appear more than once as it is re-ranked:
//
//   ### BL-007 — Title                       (Now / Next / Later sections)
//   - **Groomed 2026-10-20:** Open, needs migration 0063 ...
//   - **User value:** ...
//
//   | 7 | BL-007 | Title | ... | Open (0063) |   (summary table: bucket column)
//
//   - **BL-063 Title (needs a column, M1):** text        ("Added ..." sections)
//     - **Groomed 2026-10-20:** Open, needs migration M1 ...
//
//   3. **BL-139 Title.** Migration: no. Effort S.  ("Ranked open work" rounds)
//      - **Status (2026-10-21): built, no migration.** ...
//
// plus round-1 entries that lead with a title and point at a parent item:
//
//   4. **Fix the slowest pages from real numbers** (BL-099 follow-up). ...
//
// Status comes from what the file says, nothing else: a "Done" in the bold
// lead, a struck-through lead, a Groomed/Status line, a bold "Done" or
// "Built behind ..." child line, or the summary table's bucket. A done signal
// next to "still open" / "Remaining:" / "Partly done" makes it partly done.
// When one id is written up more than once, done wins (done is terminal).
//
// Security-review sections are not backlog items and are skipped, as are the
// superseded "Priorities" list and rows without a BL id.

import { createHash } from 'node:crypto'
import { inlineText } from '../../release-notes/lib/markdown'

export type Status = 'open' | 'partly' | 'done' | 'obsolete'

export interface BacklogItem {
  /** Unique key: the id, or `BL-069#2` for a round-1 part of BL-069. */
  key: string
  /** Display id, e.g. BL-069. */
  id: string
  n: number
  title: string
  /** One line: what it is, or for a partly done item what is left. */
  summary: string
  status: Status
  /** Short status labels: "Partly done", "Needs migration M2", "Blocked on OA-9"... */
  labels: string[]
  /** The `##` section the item was last written up in. */
  section: string
  /** The display group (round, or "Earlier backlog"). */
  group: string
  /** Sort rank of the group: higher rounds first. */
  groupRank: number
  georgia: boolean
  /** A round-1 slice of another item (`(BL-099 follow-up)`). */
  partOf: string | null
  /** File order, for stable sorting. */
  order: number
}

export interface BacklogGroup {
  name: string
  items: BacklogItem[]
}

export interface Backlog {
  /** Everything not done or obsolete, in display order (Georgia first). */
  open: BacklogItem[]
  closed: BacklogItem[]
  groups: BacklogGroup[]
}

export class BacklogFormatError extends Error {}

const SKIP_SECTION = /^(priorities|scoring|summary table|ui\/ux items|security review)/i
const ID = /\bBL-(\d{3})\b/
const H3 = /^###\s+BL-(\d{3})\s*[—–:-]\s*(.+?)\s*$/
const LEAD = /^(?:-|\d+\.)\s+\*\*BL-(\d{3})\b(.*)$/
const REF_LEAD = /^\d+\.\s+(~~)?\*\*(?!BL-)([^*]+)\*\*(~~)?\s*(.*)$/
const REMAINING = /partly done|still open|\bnot yet:|(?:^|[\s(])left:|remaining:|\bdone\b[^.\n]*?\bexcept\b/i
const META_LABEL =
  /^\*\*(groomed|status|effort|evidence|risk|acceptance|keys|migration|files|override|done|built|stopgap|first part|core built|owner|follow-ups|blocked|verify first|note|flag|schema|storage|stopgap shipped|rule:)/i

interface Entry {
  id: string
  n: number
  title: string
  lead: string
  lines: string[]
  section: string
  partOf: string | null
  struck: boolean
  tableBucket: string | null
  tableMig: string | null
  tableKeys: boolean
  order: number
}

function splitSections(md: string): { name: string; lines: string[] }[] {
  const out: { name: string; lines: string[] }[] = []
  let cur: { name: string; lines: string[] } | null = null
  for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line)
    if (h && !line.startsWith('###')) {
      cur = { name: h[1]!, lines: [] }
      out.push(cur)
      continue
    }
    cur?.lines.push(line)
  }
  return out
}

function parseTable(md: string): Map<string, { bucket: string; mig: string; keys: boolean }> {
  const rows = new Map<string, { bucket: string; mig: string; keys: boolean }>()
  for (const line of md.split('\n')) {
    const cells = line.split('|').map((c) => c.trim())
    // ['', rank, id, title, imp, conf, eff, score, mig, keys, bucket, '']
    if (cells.length < 12 || !/^\d+$/.test(cells[1]!) || !/^BL-\d{3}$/.test(cells[2]!)) continue
    rows.set(cells[2]!, { mig: cells[8]!, keys: /yes/i.test(cells[9]!), bucket: cells[10]! })
  }
  return rows
}

/** Strips markdown, struck text and extra space. */
export function plain(s: string): string {
  return inlineText(s.replace(/~~[^~]*~~/g, ''))
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Never let an address or a key-shaped token into the email. */
export function scrub(s: string): string {
  return s
    .replace(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi, '[address]')
    .replace(/\b(?:sk|rk|pk|whsec)_(?:live|test)_[A-Za-z0-9]+/g, '[key]')
    .replace(/\bre_[A-Za-z0-9_]{16,}/g, '[key]')
    .replace(/\beyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]+)*/g, '[key]')
}

const ABBREV = /\b(?:Civ|Prop|Code|Stat|ch|e\.g|i\.e|vs|No|St|Art|Sec|approx)\.$/i

/** First sentence (not fooled by "Civ. Code" or "ch."), capped at `max`. */
function oneLine(s: string, max = 200): string {
  let t = scrub(plain(s))
  const re = /\.(?=\s+[A-Z(])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    const head = t.slice(0, m.index + 1)
    if (head.length >= 40 && !ABBREV.test(head)) {
      t = head
      break
    }
  }
  if (t.length > max) t = `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`
  return t.replace(/[.;:]$/, '')
}

function cleanTitle(raw: string): string {
  let t = raw
    .replace(/\s*\((?:Done|done|built)\b[^]*$/, '')
    .replace(/\s*[—–-]+\s*(?:Done|\*\*superseded)\b.*$/, '')
    .trim()
  t = t.replace(/[.:]+$/, '').trim()
  return plain(t)
}

function collectEntries(md: string): Entry[] {
  const table = parseTable(md)
  const entries: Entry[] = []
  let order = 0
  for (const sec of splitSections(md)) {
    if (SKIP_SECTION.test(sec.name)) continue
    const ranked = /^ranked open work/i.test(sec.name)
    let cur: Entry | null = null
    let inH3 = false
    const push = (e: Entry) => {
      entries.push(e)
      cur = e
    }
    for (const line of sec.lines) {
      const h3 = H3.exec(line)
      if (line.startsWith('### ')) {
        if (!h3) {
          cur = null
          inH3 = false
          continue
        }
        const id = `BL-${h3[1]}`
        const row = table.get(id)
        push({
          id,
          n: Number(h3[1]),
          title: cleanTitle(h3[2]!),
          lead: h3[2]!,
          lines: [],
          section: sec.name,
          partOf: null,
          struck: false,
          tableBucket: row?.bucket ?? null,
          tableMig: row?.mig ?? null,
          tableKeys: row?.keys ?? false,
          order: order++,
        })
        inH3 = true
        continue
      }
      if (inH3) {
        cur!.lines.push(line)
        continue
      }
      const lead = LEAD.exec(line)
      if (lead) {
        const rest = lead[2]!
        const bold = /^(.*?)\*\*/.exec(rest)
        push({
          id: `BL-${lead[1]}`,
          n: Number(lead[1]),
          title: cleanTitle(bold ? bold[1]! : rest),
          lead: line,
          lines: [],
          section: sec.name,
          partOf: null,
          struck: false,
          tableBucket: null,
          tableMig: null,
          tableKeys: false,
          order: order++,
        })
        continue
      }
      const ref = ranked ? REF_LEAD.exec(line) : null
      const refId = ref ? /^\(([^)]*)\)/.exec(ref[4]!.replace(/^\*\*[^*]*\*\*\s*/, '').trim()) : null
      const refBl = refId ? ID.exec(refId[1]!) : null
      if (ref && refBl) {
        const id = `BL-${refBl[1]}`
        const whole = refId![1]!.trim() === id
        push({
          id,
          n: Number(refBl[1]),
          title: cleanTitle(ref[2]!),
          lead: line,
          lines: [],
          section: sec.name,
          partOf: whole ? null : id,
          struck: ref[1] === '~~',
          tableBucket: null,
          tableMig: null,
          tableKeys: false,
          order: order++,
        })
        continue
      }
      // A new column-0 list item, heading-like bold line or paragraph ends the entry.
      if (/^(?:-\s|\d+\.\s|\*\*|[A-Za-z])/.test(line)) {
        cur = null
        continue
      }
      ;(cur as Entry | null)?.lines.push(line)
    }
  }
  return entries
}

interface Classified {
  status: Status
  labels: string[]
  summary: string
  georgia: boolean
}

function labelAfter(lines: string[], label: RegExp): string | null {
  for (const l of lines) {
    const m = label.exec(l.trim())
    if (m) return m[1]!.trim()
  }
  return null
}

function classify(e: Entry, openOa: ReadonlySet<string>): Classified {
  const all = [e.lead, ...e.lines]
  const text = all.join('\n')
  const leadBody = e.lead.replace(/^(?:-|\d+\.)\s+/, '')
  const leadBold = (/\*\*(.*?)\*\*/.exec(leadBody)?.[1] ?? e.lead).replace(/^BL-\d{3}\s*/, '')
  const leadAfterBold = leadBody.replace(/^\*\*.*?\*\*/, '')
  // The newest grooming is the last Groomed line in the entry.
  const groomedAll = e.lines.map((l) => /^\s*-?\s*\*\*Groomed[^*]*\*\*\s*(.*)$/.exec(l)?.[1]).filter((g): g is string => !!g)
  const groomed = groomedAll.length ? groomedAll[groomedAll.length - 1]! : null
  const statusLines = all
    .map((l) => /\*{1,2}Status[^*]*?\*{1,2}:?\s*(.*)$/.exec(l)?.[0])
    .filter((l): l is string => !!l)
  const DONE_LABEL = /\*\*(?:Done\b(?!\s+except)|Built behind|Core built|First part built|Stopgap shipped)/
  const boldChildDone = e.lines.some((l) => DONE_LABEL.test(l.trim())) || DONE_LABEL.test(leadAfterBold)

  const leadDone = e.struck || (/\b(?:Done|built)\b/.test(leadBold) && !/\bexcept\b/.test(leadBold))
  const obsolete =
    /\bsuperseded\b|\bobsolete\b/i.test(leadBold) || /\*\*superseded/i.test(e.lead) || (groomed !== null && /^obsolete/i.test(groomed))
  const otherDone =
    statusLines.some((l) => /\b(?:built|shipped|written|done)\b/i.test(l) && !/\b(?:not (?:yet )?built|partly done)\b/i.test(l)) ||
    boldChildDone ||
    (e.tableBucket !== null && /^\**done/i.test(e.tableBucket))
  const partlySignal =
    (groomed !== null && /^partly/i.test(groomed)) ||
    (e.tableBucket !== null && /^\**partly/i.test(e.tableBucket)) ||
    /\bdone\b[^)]*\)?\s*except\b/i.test(leadBold)

  // Precedence: an explicit Done in the lead (the newest top-level word),
  // then the newest Groomed line, then the other signals.
  let status: Status
  if (leadDone) status = 'done'
  else if (obsolete) status = 'obsolete'
  else if (groomed !== null && /^done\b/i.test(groomed)) status = 'done'
  else if (otherDone) status = REMAINING.test(text) || partlySignal ? 'partly' : 'done'
  else if (partlySignal) status = 'partly'
  else status = 'open'

  const labels: string[] = []
  if (status === 'partly') labels.push('Partly done')
  if (e.partOf) labels.push(`Part of ${e.partOf}`)
  const statusText = [e.lead, groomed ?? '', e.tableMig ?? '', ...e.lines.filter((l) => /migration/i.test(l)).slice(0, 3)].join('\n')
  const mig =
    /Migration:\s*\*\*yes\s*\((M\d+)/i.exec(statusText)?.[1] ??
    /needs (?:a )?migration(?: batch)?\s+(M\d+(?:-prep)?|\d{4})\b/i.exec(groomed ?? '')?.[1] ??
    /\byes\s*\((M\d+)\)/i.exec(e.tableMig ?? '')?.[1] ??
    (/needs (?:a |its own )?migration|Migration:\s*\*\*yes/i.test(groomed ?? statusText) || /\byes\b/i.test(e.tableMig ?? '')
      ? ''
      : null)
  if (mig !== null && status !== 'done') labels.push(mig ? `Needs migration ${mig}` : 'Needs a migration')
  if (e.tableKeys || /\bkeys\b/i.test(groomed ?? '')) labels.push('Needs keys')
  const blocked =
    /\*\*Blocked (?:on|until)(?::\*\*\s*\**|\s+)([^*.]+)/i.exec(text)?.[1] ?? null
  if (blocked) labels.push(oneLine(`Blocked ${/blocked until/i.test(text) ? 'until' : 'on'} ${blocked}`, 70))
  for (const m of text.matchAll(/\bOA-(\d+)\b/g)) {
    const oa = `OA-${m[1]}`
    if (openOa.has(oa) && !labels.includes(`Blocked on ${oa}`)) labels.push(`Blocked on ${oa}`)
  }
  const deadline = /\bdeadline\b/i.test(e.lead) ? /\b(20\d\d-\d\d-\d\d)\b/.exec(e.lead)?.[1] : undefined
  if (deadline) labels.push(`Deadline ${deadline}`)

  // Summary: for partly done items, what is left; otherwise what it is.
  let summary = ''
  if (status === 'partly') {
    const LEFT = /(?:Remaining[^:]*|Still open(?:, no migration)?|Not yet|Left|Open(?:, no migration)?):\s*(.+)$/
    const left =
      LEFT.exec(groomed ?? '')?.[1] ??
      /\bOnly (.+?) remains\b/.exec(groomed ?? '')?.[1] ??
      [...e.lines].reverse().map((l) => /(?:Still open|Not yet|Remaining[^:]*):\s*(.+)$/.exec(l)?.[1]).find(Boolean) ??
      null
    if (left) summary = `Left: ${oneLine(left, 180)}`
  }
  if (!summary) {
    const candidates: string[] = []
    const userValue = labelAfter(e.lines, /^-?\s*\*\*User value:\*\*\s*(.+)$/)
    if (userValue) candidates.push(userValue)
    // The lead paragraph: the lead line plus its wrapped continuation lines.
    let para = e.lead
    for (const l of e.lines) {
      // A Groomed line can sit between the lead and its wrapped continuation.
      if (/^\s*-\s+\*\*Groomed/.test(l)) continue
      if (!l.trim() || /^\s*(?:-|\d+\.)\s/.test(l)) break
      para += ` ${l.trim()}`
    }
    let rest = e.partOf || e.struck ? para.replace(/^.*?\)\.?\s*/, '') : para.replace(/^(?:-|\d+\.)\s+\*\*[^*]*\*\*/, '')
    if (e.lead.startsWith('###')) rest = ''
    rest = rest
      .trim()
      .replace(/^[—–:-]+\s*/, '')
      .replace(/^\([^)]*\)\s*:?\s*/, '')
      .replace(/^[—–:-]+\s*/, '')
    if (rest && !/^(Migration|Effort|Score)\b/.test(rest) && !/^\*\*Done/.test(rest)) candidates.push(rest)
    for (const lbl of ['Pain', 'Build', 'Rule', 'Today', 'What']) {
      const v = labelAfter(e.lines, new RegExp(`^-?\\s*\\*\\*${lbl}:\\*\\*\\s*(.+)$`))
      if (v) candidates.push(v)
    }
    for (const l of e.lines) {
      const t = l.trim().replace(/^(?:-|\d+\.)\s+/, '')
      if (t && !META_LABEL.test(t) && !/^\*\*[^*]+:\*\*\s*$/.test(t) && !t.startsWith('~~')) {
        candidates.push(t)
        break
      }
    }
    summary = oneLine(candidates.find((c) => plain(c).length > 0) ?? '')
  }

  const gaWords = (s: string) => [...s.matchAll(/\b(?:Georgia|GA)\b/g)].length
  const georgia = gaWords(`${e.title} ${summary}`) > 0 || gaWords(text) >= 2
  return { status, labels, summary, georgia }
}

function groupOf(section: string): { name: string; rank: number } {
  if (/^ranked open work/i.test(section)) {
    const n = Number(/round\s+(\d+)/i.exec(section)?.[1] ?? 1)
    const date = /(20\d\d-\d\d-\d\d)/.exec(section)?.[1]
    return { name: `Round ${n}${date ? ` (${date})` : ''}`, rank: n }
  }
  return { name: 'Earlier backlog', rank: 0 }
}

const STATUS_RANK: Record<Status, number> = { done: 3, obsolete: 2, partly: 1, open: 0 }

/**
 * @param openOwnerActions ids of OPEN owner actions (docs/owner-actions.md),
 *   so an item that names one is labelled "Blocked on OA-n". Done ones are ignored.
 */
export function parseBacklog(md: string, openOwnerActions: Iterable<string> = []): Backlog {
  const openOa = new Set(openOwnerActions)
  const entries = collectEntries(md)
  if (!entries.length) throw new BacklogFormatError('no BL-### items found')

  const items = new Map<string, BacklogItem>()
  const partCount = new Map<string, number>()
  for (const e of entries) {
    const c = classify(e, openOa)
    const g = groupOf(e.section)
    let key = e.id
    if (e.partOf) {
      const k = (partCount.get(e.id) ?? 0) + 1
      partCount.set(e.id, k)
      key = `${e.id}#${k}`
    }
    const item: BacklogItem = {
      key,
      id: e.id,
      n: e.n,
      title: e.title,
      summary: c.summary,
      status: c.status,
      labels: c.labels,
      section: e.section,
      group: g.name,
      groupRank: g.rank,
      georgia: c.georgia,
      partOf: e.partOf,
      order: e.order,
    }
    const prev = items.get(key)
    if (!prev) {
      items.set(key, item)
      continue
    }
    // Written up again: the later write-up places it, but done is terminal.
    const keepStatus = STATUS_RANK[prev.status] > STATUS_RANK[item.status] && prev.status !== 'partly'
    items.set(key, {
      ...item,
      title: item.title || prev.title,
      summary: item.summary || prev.summary,
      status: keepStatus ? prev.status : item.status,
      labels: keepStatus ? prev.labels : item.labels,
      georgia: prev.georgia || item.georgia,
    })
  }

  const all = [...items.values()]
  const isOpen = (i: BacklogItem) => i.status === 'open' || i.status === 'partly'
  const open = all.filter(isOpen)
  const closed = all.filter((i) => !isOpen(i))

  const byOrder = (a: BacklogItem, b: BacklogItem) => a.order - b.order
  const groups: BacklogGroup[] = []
  const ga = open.filter((i) => i.georgia).sort((a, b) => b.groupRank - a.groupRank || byOrder(a, b))
  if (ga.length) groups.push({ name: 'Georgia', items: ga })
  const rest = open.filter((i) => !i.georgia)
  const names = [...new Map(rest.map((i) => [i.group, i.groupRank])).entries()].sort((a, b) => b[1] - a[1])
  for (const [name] of names) groups.push({ name, items: rest.filter((i) => i.group === name).sort(byOrder) })

  return { open: groups.flatMap((g) => g.items), closed, groups }
}

export function countPartly(items: readonly BacklogItem[]): number {
  return items.filter((i) => i.status === 'partly').length
}

/** Hash of the open items (key, title, status, labels): 16 hex chars. */
export function openItemsHash(items: readonly BacklogItem[]): string {
  const canon = JSON.stringify(
    [...items].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map((i) => [i.key, i.title, i.status, i.labels]),
  )
  return createHash('sha256').update(canon).digest('hex').slice(0, 16)
}
