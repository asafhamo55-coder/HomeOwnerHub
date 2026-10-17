// Fallback note built from commit subjects, for a deploy with no
// docs/releases file. Pure: the caller runs git and passes the subjects in.

import { RELEASE_TIME_ZONE, type ReleaseNote, type SectionName } from './note'

export interface Commit {
  sha: string
  subject: string
}

interface Parsed {
  type: string | null
  scope: string | null
  text: string
}

const CONVENTIONAL = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/

export function parseSubject(subject: string): Parsed {
  const m = CONVENTIONAL.exec(subject.trim())
  if (!m) return { type: null, scope: null, text: subject.trim() }
  return { type: m[1]!.toLowerCase(), scope: m[2]?.trim() || null, text: m[3]!.trim() }
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s
}

/** Which section a commit type belongs in. Unknown types are housekeeping. */
export function sectionForType(type: string | null): SectionName {
  if (type === 'feat') return "What's new"
  if (type === 'fix') return 'Fixes'
  return 'Under the hood'
}

/** Merge commits are noise in a release note. */
function isMerge(subject: string): boolean {
  return /^Merge (branch|commit|pull request|remote-tracking)/.test(subject)
}

export function noteFromCommits(
  commits: readonly Commit[],
  meta: { sha: string; deployedAt: string; previousSha?: string | null },
): ReleaseNote {
  const real = commits.filter((c) => !isMerge(c.subject))
  const feats = new Map<string, string[]>()
  const fixes: string[] = []
  const under = new Map<string, number>()
  for (const c of real) {
    const p = parseSubject(c.subject)
    const section = sectionForType(p.type)
    const line = capitalize(p.text) + (p.scope ? ` (${p.scope})` : '')
    if (section === "What's new") {
      const area = capitalize(p.scope ?? 'General')
      const list = feats.get(area) ?? []
      list.push(capitalize(p.text))
      feats.set(area, list)
    } else if (section === 'Fixes') {
      fixes.push(line)
    } else {
      const kind = p.type ?? 'other'
      under.set(kind, (under.get(kind) ?? 0) + 1)
    }
  }

  const sections: ReleaseNote['sections'] = {}
  const short = meta.sha.slice(0, 7)
  const range = meta.previousSha ? ` since ${meta.previousSha.slice(0, 7)}` : ''
  sections.Summary =
    `This update (${short}) is live. It includes ${real.length} change${real.length === 1 ? '' : 's'}${range}: ` +
    `${countOf(feats)} new or improved feature${countOf(feats) === 1 ? '' : 's'} and ${fixes.length} fix${fixes.length === 1 ? '' : 'es'}. ` +
    'No written release note was found for this deploy, so this summary was put together from the change list.'
  if (feats.size) {
    sections["What's new"] = [...feats.entries()]
      .map(([area, items]) => `### ${area}\n${items.map((i) => `- ${i}`).join('\n')}`)
      .join('\n\n')
  }
  if (fixes.length) sections.Fixes = fixes.map((f) => `- ${f}`).join('\n')
  if (under.size) {
    const label: Record<string, string> = {
      docs: 'documentation update',
      test: 'test change',
      chore: 'maintenance change',
      refactor: 'code clean-up',
      perf: 'performance change',
      ci: 'build pipeline change',
      build: 'build change',
      style: 'formatting change',
      other: 'other change',
    }
    sections['Under the hood'] = [...under.entries()]
      .map(([kind, n]) => {
        const l = label[kind] ?? `${kind} change`
        return `- ${n} ${l}${n === 1 ? '' : 's'}`
      })
      .join('\n')
  }

  return {
    sha: meta.sha,
    deployedAt: meta.deployedAt,
    title: `${real.length} change${real.length === 1 ? '' : 's'} shipped`,
    sections,
    screenshots: [],
    source: 'commits',
    files: [],
  }
}

function countOf(m: Map<string, string[]>): number {
  let n = 0
  for (const v of m.values()) n += v.length
  return n
}

/** `date` as ISO 8601 in America/New_York, with its UTC offset. */
export function toNewYorkIso(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: RELEASE_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'longOffset',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>
  const offset = (parts.timeZoneName ?? 'GMT').replace('GMT', '') || '+00:00'
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`
}

/** "Saturday, October 17, 2026 at 3:55 PM EDT". */
export function formatDeployedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('en-US', {
    timeZone: RELEASE_TIME_ZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(d)
}
