// CI screenshots in release notes: which PNG from the `ui-shots-<sha>`
// artifact (.github/workflows/ui-shots.yml) shows a route, which routes a
// deploy touched, and which commit's UI shots run stands in for a deploy.
//
// Pure functions only (no git, no network, no fs) so the tests can call
// them. The CLI that talks to git and the GitHub API is fetch-shots.ts.
//
// File naming comes from scripts/ui-shots.ts:
//   .ui-shots/<shot name>--<width>-<theme>.png
// and the shot list (name ↔ route) from scripts/ui-shots-list.ts.

import { SHOTS, THEMES, WIDTHS, type Shot } from '../../ui-shots-list'

/** One entry of a note's `shots:` front matter, or an auto-selected route. */
export interface ShotRequest {
  route: string
  caption?: string
}

/** At most this many shots are picked automatically when a note has no `shots:` list. */
export const MAX_AUTO_SHOTS = 3

/** Preferred file per shot: desktop light, then phone light. */
export const PREFERRED_VARIANTS = [
  { width: 1440, theme: 'light' },
  { width: 375, theme: 'light' },
] as const

export function shotFileName(name: string, width: number, theme: 'light' | 'dark'): string {
  return `${name}--${width}-${theme}.png`
}

/** Settings that make a shot a special view (a dialog, a filtered org, …) rather than the plain page. */
const MODIFIERS = ['viewport', 'click', 'palette', 'print', 'copilot', 'rail', 'org', 'scrollBottom'] as const

function modifierCount(s: Shot): number {
  return MODIFIERS.filter((k) => Boolean(s[k])).length
}

/** `/a/[id]/b/`, `/a/:x/b` → `/a/*\/b`. Query strings are kept as-is. */
export function normalizeRoute(route: string): string {
  const trimmed = route.trim()
  const q = trimmed.indexOf('?')
  const pathPart = q >= 0 ? trimmed.slice(0, q) : trimmed
  const query = q >= 0 ? trimmed.slice(q) : ''
  const segs = pathPart
    .split('/')
    .filter(Boolean)
    .map((s) => (/^\[.+\]$/.test(s) || /^:[A-Za-z]\w*$/.test(s) ? '*' : s))
  return `/${segs.join('/')}${query}`
}

/**
 * The plain HOA-app shot of a route: same path (dynamic segments match any
 * `:var` fixture), same query string, fewest modifiers; ties go to the
 * earlier entry in the list. Null when ui-shots has no fixture for it.
 */
export function shotForRoute(route: string, shots: readonly Shot[] = SHOTS): Shot | null {
  const want = normalizeRoute(route)
  let best: Shot | null = null
  for (const s of shots) {
    if ((s.app ?? 'hoa') !== 'hoa') continue
    if (normalizeRoute(s.path) !== want) continue
    if (!best || modifierCount(s) < modifierCount(best)) best = s
  }
  return best
}

/** File names to try for a shot, in order: 1440-light, then 375-light — only those it actually captures. */
export function candidateFiles(shot: Shot): string[] {
  const widths = shot.widths ?? WIDTHS
  const themes = shot.themes ?? THEMES
  return PREFERRED_VARIANTS.filter((v) => widths.includes(v.width) && themes.includes(v.theme)).map((v) =>
    shotFileName(shot.name, v.width, v.theme),
  )
}

/**
 * The artifact file (basename) for a route, or null. `available` is the set
 * of PNG basenames the downloaded artifact contains.
 */
export function fileForRoute(
  route: string,
  available: ReadonlySet<string>,
  shots: readonly Shot[] = SHOTS,
): string | null {
  const shot = shotForRoute(route, shots)
  if (!shot) return null
  return candidateFiles(shot).find((f) => available.has(f)) ?? null
}

const HOA_APP_DIR = 'apps/hoa/src/app/'

/**
 * `apps/hoa/src/app/(dashboard)/accounting/payment-plans/page.tsx` →
 * `/accounting/payment-plans`. Route groups `(x)` and parallel slots `@x`
 * are dropped; dynamic segments stay as `[x]`. Null for anything that is
 * not an HOA page, for private `_folders`, and for catch-all routes.
 */
export function pageFileToRoute(file: string): string | null {
  const f = file.replace(/\\/g, '/')
  if (!f.startsWith(HOA_APP_DIR)) return null
  const m = /^(.*?)\/?page\.(tsx|ts|jsx|js|mdx)$/.exec(f.slice(HOA_APP_DIR.length))
  if (!m) return null
  const segs: string[] = []
  for (const seg of m[1]!.split('/').filter(Boolean)) {
    if (/^\(.+\)$/.test(seg) || seg.startsWith('@')) continue
    if (seg.startsWith('_') || /^\[\[?\.\.\./.test(seg)) return null
    segs.push(seg)
  }
  return `/${segs.join('/')}`
}

export function isDynamicRoute(route: string): boolean {
  return route.split('/').some((s) => /^\[.+\]$/.test(s) || /^:/.test(s))
}

/**
 * Up to `max` routes for a deploy whose note has no `shots:` list: the HOA
 * pages changed in the deploy diff, in diff order, that ui-shots has a
 * fixture for. A dynamic route without a fixture is skipped.
 */
export function autoSelectRoutes(
  changedFiles: readonly string[],
  shots: readonly Shot[] = SHOTS,
  max = MAX_AUTO_SHOTS,
): ShotRequest[] {
  const out: ShotRequest[] = []
  const seen = new Set<string>()
  for (const file of changedFiles) {
    if (out.length >= max) break
    // The (dev) group is the internal component gallery, not a product screen.
    if (file.includes('/(dev)/')) continue
    const route = pageFileToRoute(file)
    if (!route) continue
    const shot = shotForRoute(route, shots)
    if (!shot || seen.has(shot.name)) continue
    seen.add(shot.name)
    out.push({ route })
  }
  return out
}

/** "Accounting › Payment plans" for `/accounting/payment-plans`; dynamic segments are left out. */
export function captionForRoute(route: string): string {
  const segs = normalizeRoute(route)
    .replace(/\?.*$/, '')
    .split('/')
    .filter((s) => s && s !== '*')
    .map((s) => {
      const words = decodeURIComponent(s).replace(/[-_]+/g, ' ')
      return words.charAt(0).toUpperCase() + words.slice(1)
    })
  return segs.length ? segs.join(' › ') : 'Dashboard'
}

export const SHOTS_UNAVAILABLE = 'Screenshots unavailable for this deploy.'

export interface CiShot {
  route: string
  /** Absolute path of the PNG in the downloaded artifact. */
  file: string
  caption: string
}

/**
 * Requests → artifact files. `available` maps PNG basename → absolute path.
 * A request with no fixture or no file is dropped; duplicates (two routes,
 * one shot) are attached once.
 */
export function resolveCiShots(
  requests: readonly ShotRequest[],
  available: ReadonlyMap<string, string>,
  shots: readonly Shot[] = SHOTS,
): { attached: CiShot[]; missing: string[] } {
  const names = new Set(available.keys())
  const attached: CiShot[] = []
  const missing: string[] = []
  const used = new Set<string>()
  for (const r of requests) {
    const f = fileForRoute(r.route, names, shots)
    if (!f) {
      missing.push(r.route)
      continue
    }
    if (used.has(f)) continue
    used.add(f)
    attached.push({ route: r.route, file: available.get(f)!, caption: r.caption ?? captionForRoute(r.route) })
  }
  return { attached, missing }
}

// ---------------------------------------------------------------------------
// Which commit's UI shots run to use

/** How far back from the deployed SHA to look for a commit with UI shots. */
export const MAX_ANCESTORS = 20

/**
 * True when every changed path is documentation: under `docs/` or a
 * top-level Markdown file. Anything else (including the in-app guide under
 * apps/hoa/content, which renders as pages) can change what a screen shows.
 */
export function isDocsOnly(changedFiles: readonly string[]): boolean {
  return changedFiles.every((f) => f.startsWith('docs/') || /^[^/]+\.mdx?$/.test(f))
}

export interface Ancestor {
  sha: string
  /** `git diff --name-only <sha> <deployed>`. Empty for the deployed SHA itself. */
  changedSince: readonly string[]
}

/**
 * Commits whose UI shots may stand in for the deploy, nearest first: the
 * deployed SHA itself, then each of up to MAX_ANCESTORS ancestors
 * (`git rev-list` order) from which only docs changed up to the deployed
 * SHA. An ancestor with any non-docs change since is skipped — its screens
 * may differ from what is live.
 */
export function eligibleAncestors(ancestors: readonly Ancestor[], max = MAX_ANCESTORS): string[] {
  return ancestors
    .slice(0, max + 1)
    .filter((a, i) => i === 0 || isDocsOnly(a.changedSince))
    .map((a) => a.sha)
}

export interface ShotsRun {
  id: number
  status: string
  conclusion: string | null
  /** The `ui-shots-<sha>` artifact exists and has not expired. Only meaningful once completed. */
  hasArtifact: boolean
}

export type ShotsSource =
  | { kind: 'ready'; sha: string; runId: number }
  | { kind: 'wait'; sha: string; runId: number }
  | { kind: 'none' }

/**
 * Picks the run to use. Walks the eligible commits nearest first; for each,
 * its newest run decides:
 *   - completed with the artifact → use it (a failed run still uploads its
 *     shots; only overflow fails it);
 *   - still running → wait for it, unless `skipPending` (the wait timed out),
 *     then keep walking;
 *   - completed without the artifact, or no run → keep walking.
 */
export function pickShotsSource(
  eligible: readonly string[],
  runs: ReadonlyMap<string, ShotsRun | null>,
  opts: { skipPending?: boolean } = {},
): ShotsSource {
  for (const sha of eligible) {
    const run = runs.get(sha)
    if (!run) continue
    if (run.status === 'completed') {
      if (run.hasArtifact) return { kind: 'ready', sha, runId: run.id }
      continue
    }
    if (!opts.skipPending) return { kind: 'wait', sha, runId: run.id }
  }
  return { kind: 'none' }
}
