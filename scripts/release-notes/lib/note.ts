// Release-note model: parse docs/releases/*.md files, pick the ones that
// belong to a deploy, and combine them into one email's worth of content.
//
// Convention: docs/releases/README.md. A note is committed INSIDE the
// commit it describes, so it cannot know that commit's SHA. A deploy's
// notes are therefore the note files ADDED between the previous production
// SHA and the deployed SHA (the caller resolves that list with git). The
// frontmatter `sha` is optional and informational; it is only used to find
// a note that was written after its deploy (a late note / a re-send).
//
// Pure functions only (no git, no network) so the tests can call them.

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import type { ShotRequest } from './ui-shots'

export const RELEASE_TIME_ZONE = 'America/New_York'

/** Section headings, in the order the email renders them. */
export const SECTION_ORDER = [
  'Summary',
  "What's new",
  'Fixes',
  'Under the hood',
  'Needs your action',
  'Screenshots',
] as const
export type SectionName = (typeof SECTION_ORDER)[number]

export interface Screenshot {
  alt: string
  /** Absolute path on disk. */
  file: string
  /**
   * A full-page CI capture (ui-shots): cropped to MAX_HEIGHT from the top
   * so a long page doesn't turn into a 5000px email image.
   */
  fromCi?: boolean
}

/** One docs/releases/*.md file. */
export interface NoteFile {
  file: string
  title: string
  /** Informational. Absent on a note committed with the deploy it describes. */
  sha: string | null
  /** ISO 8601 with offset. Optional: the deploy time usually comes from CI. */
  deployedAt: string | null
  sections: Partial<Record<SectionName, string>>
  screenshots: Screenshot[]
  /** The `shots:` front matter: routes to attach CI screenshots of. */
  shots: ShotRequest[]
}

/** What the email is rendered from: one deploy, one or more notes. */
export interface ReleaseNote {
  /** The DEPLOYED sha (from the workflow), never a note's own claim. */
  sha: string
  /** ISO 8601 with offset. */
  deployedAt: string
  title: string
  sections: Partial<Record<SectionName, string>>
  screenshots: Screenshot[]
  source: 'file' | 'commits'
  /** Routes whose CI screenshots to attach (the notes' `shots:` lists). Empty or absent: auto-select. */
  shotRequests?: ShotRequest[]
  /** Shown under Screenshots, e.g. when CI shots were wanted but none could be fetched. */
  screenshotNotice?: string
  /** Note files used, when source is 'file'. */
  files: string[]
}

/** Files in docs/releases that are documentation, not notes. */
const NON_NOTES = new Set(['README.md', '_template.md'])

/** `YYYY-MM-DD-HHMM-<slug>.md`. */
export const NOTE_FILENAME = /^\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9][a-z0-9-]*\.md$/

export function isNoteFile(file: string): boolean {
  const base = path.basename(file)
  return !NON_NOTES.has(base) && NOTE_FILENAME.test(base)
}

export function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text)
  if (!m) return { data: {}, body: text }
  const data: Record<string, string> = {}
  for (const line of m[1]!.split('\n')) {
    // Top-level keys only. An indented line belongs to a nested block (the
    // `whats_new:` entries read by the user guide, BL-070), and its `title:`
    // or `sha:` must never stand in for the note's own.
    if (/^\s/.test(line)) continue
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line.trim())
    if (!kv) continue
    let value = kv[2]!.trim()
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1)
    data[kv[1]!] = value
  }
  return { data, body: m[2]! }
}

/** Matches `## Heading` case-insensitively against SECTION_ORDER. */
function sectionFor(heading: string): SectionName | null {
  const norm = heading.trim().toLowerCase().replace(/[’‘]/g, "'")
  return SECTION_ORDER.find((s) => s.toLowerCase() === norm) ?? null
}

export function splitSections(body: string): Partial<Record<SectionName, string>> {
  const out: Partial<Record<SectionName, string>> = {}
  let current: SectionName | null = null
  let buf: string[] = []
  const flush = () => {
    if (current) {
      const text = buf.join('\n').trim()
      if (text) out[current] = text
    }
    buf = []
  }
  for (const line of body.split('\n')) {
    const h = /^##\s+(.+?)\s*#*\s*$/.exec(line)
    if (h && !line.startsWith('###')) {
      flush()
      current = sectionFor(h[1]!)
      continue
    }
    if (current) buf.push(line)
  }
  flush()
  return out
}

/** `![alt](relative/path.jpg)` in the Screenshots section. */
export function parseScreenshots(markdown: string | undefined, baseDir: string): Screenshot[] {
  if (!markdown) return []
  const shots: Screenshot[] = []
  const re = /!\[([^\]]*)\]\(([^)\s]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(markdown))) {
    const rel = m[2]!
    // Relative paths only: a note never pulls an image from the network or
    // from an absolute path elsewhere on the machine.
    if (/^[a-z]+:/i.test(rel) || path.isAbsolute(rel)) continue
    shots.push({ alt: m[1]!.trim(), file: path.resolve(baseDir, rel) })
  }
  return shots
}

/**
 * The optional `shots:` list from the front matter:
 *
 *   shots:
 *     - route: /accounting/payment-plans
 *       caption: Choosing the charges a plan replaces
 *     - /approvals            # a bare route is fine too
 *
 * Read with a real YAML parser (the block is nested, which parseFrontmatter
 * skips). Never throws: a malformed block or entry is dropped, because a
 * screenshot must never stop the email. Routes must start with `/`.
 */
export function parseShotsFrontmatter(raw: string): ShotRequest[] {
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const m = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!m) return []
  let data: unknown
  try {
    data = YAML.parse(m[1]!)
  } catch {
    return []
  }
  const list = (data as { shots?: unknown } | null)?.shots
  if (!Array.isArray(list)) return []
  const out: ShotRequest[] = []
  for (const item of list) {
    const entry = typeof item === 'string' ? { route: item } : (item as { route?: unknown; caption?: unknown } | null)
    const route = typeof entry?.route === 'string' ? entry.route.trim() : ''
    if (!route.startsWith('/') || route.startsWith('//')) continue
    const caption = typeof entry?.caption === 'string' && entry.caption.trim() ? entry.caption.trim() : undefined
    out.push(caption ? { route, caption } : { route })
  }
  return out
}

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/

export function parseNote(raw: string, file: string): NoteFile {
  const { data, body } = parseFrontmatter(raw)
  if (!data.title) throw new Error(`${path.basename(file)}: frontmatter is missing "title"`)
  const deployedAt = data.deployed_at || null
  if (deployedAt && !ISO_WITH_OFFSET.test(deployedAt)) {
    throw new Error(`${path.basename(file)}: deployed_at must be ISO 8601 with an offset, e.g. 2026-10-17T15:55:00-04:00`)
  }
  const sections = splitSections(body)
  return {
    file,
    title: data.title,
    sha: data.sha && data.sha !== 'pending' ? data.sha : null,
    deployedAt,
    sections,
    screenshots: parseScreenshots(sections.Screenshots, path.dirname(file)),
    shots: parseShotsFrontmatter(raw),
  }
}

export function readNote(file: string): NoteFile {
  return parseNote(readFileSync(file, 'utf8'), file)
}

/** True when two SHAs name the same commit (prefix match, ≥7 chars). */
export function shaMatches(a: string, b: string): boolean {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  if (x.length < 7 || y.length < 7) return false
  return x.startsWith(y) || y.startsWith(x)
}

export function listNoteFiles(dir: string): string[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  return names
    .map((n) => path.join(dir, n))
    .filter(isNoteFile)
    .sort()
}

/**
 * The notes for a deploy of `sha`:
 *  1. every note file in `addedInRange` (added between the previous prod
 *     SHA and `sha`), oldest first by filename;
 *  2. failing that, notes in `dir` whose informational `sha` matches —
 *     a note written after its deploy, or a re-send;
 *  3. failing that, nothing (the caller falls back to commit subjects).
 */
export function selectNotes(dir: string, sha: string, addedInRange: readonly string[]): NoteFile[] {
  const added = addedInRange.filter(isNoteFile).sort((a, b) => path.basename(a).localeCompare(path.basename(b)))
  if (added.length) return added.map(readNote)
  return listNoteFiles(dir)
    .map(readNote)
    .filter((n) => n.sha !== null && shaMatches(n.sha, sha))
}

/**
 * One email's content from one or more notes. The sha is always the
 * deployed one passed in. Sections are concatenated in note order.
 */
export function combineNotes(
  notes: readonly NoteFile[],
  ctx: { sha: string; deployedAt?: string | null; now?: () => string },
): ReleaseNote {
  if (!notes.length) throw new Error('combineNotes needs at least one note')
  const sections: ReleaseNote['sections'] = {}
  for (const name of SECTION_ORDER) {
    if (name === 'Screenshots') continue
    const parts = notes.map((n) => n.sections[name]).filter((s): s is string => Boolean(s))
    if (parts.length) sections[name] = parts.join('\n\n')
  }
  const title =
    notes.length === 1
      ? notes[0]!.title
      : notes.length === 2
        ? `${notes[0]!.title} · ${notes[1]!.title}`
        : `${notes[0]!.title} + ${notes.length - 1} more updates`
  const noteTime = [...notes].reverse().find((n) => n.deployedAt)?.deployedAt ?? null
  return {
    sha: ctx.sha,
    deployedAt: ctx.deployedAt ?? noteTime ?? (ctx.now ?? (() => new Date().toISOString()))(),
    title,
    sections,
    screenshots: notes.flatMap((n) => n.screenshots),
    shotRequests: notes.flatMap((n) => n.shots),
    source: 'file',
    files: notes.map((n) => n.file),
  }
}
