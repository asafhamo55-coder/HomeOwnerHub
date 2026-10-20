// Glue between git, the note files and the renderer. The CLIs (render.ts,
// send.ts) are thin wrappers around buildEmail().

import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { renderEmail, type RenderedEmail } from './email'
import { noteFromCommits, toNewYorkIso, type Commit } from './fallback'
import { prepareImages, type ImageProcessor } from './images'
import { combineNotes, selectNotes, type ReleaseNote } from './note'
import { autoSelectRoutes, resolveCiShots, SHOTS_UNAVAILABLE, type ShotRequest } from './ui-shots'

export const NOTES_DIR = 'docs/releases'

function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

export function resolveSha(root: string, ref: string): string {
  return git(root, ['rev-parse', '--verify', `${ref}^{commit}`]).trim()
}

export function commitsInRange(root: string, previousSha: string | null, sha: string): Commit[] {
  const range = previousSha ? [`${previousSha}..${sha}`] : ['-n', '30', sha]
  const out = git(root, ['log', '--no-merges', '--format=%H%x1f%s', ...range])
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [h, s] = line.split('\x1f')
      return { sha: h!, subject: s ?? '' }
    })
}

/**
 * Note files ADDED between the previous prod SHA and the deployed one —
 * the notes that ship with this deploy. Absolute paths.
 */
export function notesAddedInRange(root: string, previousSha: string | null, sha: string): string[] {
  if (!previousSha) return []
  const out = git(root, ['diff', '--diff-filter=A', '--name-only', previousSha, sha, '--', `${NOTES_DIR}/*.md`])
  return out
    .split('\n')
    .filter(Boolean)
    .map((f) => path.resolve(root, f))
}

export interface BuildOptions {
  root: string
  sha: string
  previousSha?: string | null
  /** The deploy time (from CI). Overrides a note's deployed_at; defaults to the note's, else now. */
  deployedAt?: Date
  imageProcessor?: ImageProcessor
  /**
   * Where the workflow downloaded the `ui-shots-<sha>` artifact. Set (even
   * to a missing or empty directory) to attach CI screenshots; leave unset
   * to skip them entirely (local previews).
   */
  uiShotsDir?: string
}

export interface CiShotsSummary {
  /** Explicit (`shots:`) or auto-selected from the deploy diff. */
  mode: 'listed' | 'auto'
  requested: string[]
  attached: string[]
  missing: string[]
}

export interface BuiltEmail extends RenderedEmail {
  note: ReleaseNote
  /** Present when uiShotsDir was given. Routes only — no content. */
  ciShots?: CiShotsSummary
}

/** HOA app files changed in the deploy, in `git diff` order. */
export function appFilesChangedInRange(root: string, previousSha: string | null, sha: string): string[] {
  if (!previousSha) return []
  return git(root, ['diff', '--name-only', previousSha, sha, '--', 'apps/hoa/src/app'])
    .split('\n')
    .filter(Boolean)
}

/** PNG basename → absolute path, anywhere under `dir`. Empty when `dir` is missing. */
export function listPngs(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  let entries: string[]
  try {
    entries = readdirSync(dir, { recursive: true, encoding: 'utf8' })
  } catch {
    return out
  }
  for (const rel of entries.sort()) {
    if (!rel.endsWith('.png')) continue
    const base = path.basename(rel)
    if (!out.has(base)) out.set(base, path.join(dir, rel))
  }
  return out
}

/**
 * Adds the CI screenshots to the note: the notes' `shots:` routes, or —
 * when no note lists any — up to 3 HOA pages the deploy changed. When some
 * were wanted and none could be found, the email says so instead.
 */
export function attachCiShots(
  note: ReleaseNote,
  opts: { root: string; sha: string; previousSha: string | null; uiShotsDir: string },
): { note: ReleaseNote; summary: CiShotsSummary } {
  const listed = note.shotRequests ?? []
  const mode = listed.length ? 'listed' : 'auto'
  const requests: ShotRequest[] = listed.length
    ? listed
    : autoSelectRoutes(appFilesChangedInRange(opts.root, opts.previousSha, opts.sha))
  const { attached, missing } = resolveCiShots(requests, listPngs(opts.uiShotsDir))
  const next: ReleaseNote = {
    ...note,
    screenshots: [...note.screenshots, ...attached.map((s) => ({ alt: s.caption, file: s.file, fromCi: true }))],
  }
  if (requests.length && !attached.length) next.screenshotNotice = SHOTS_UNAVAILABLE
  return {
    note: next,
    summary: { mode, requested: requests.map((r) => r.route), attached: attached.map((s) => s.route), missing },
  }
}

export function resolveNote(opts: BuildOptions): ReleaseNote {
  const dir = path.join(opts.root, NOTES_DIR)
  const prev = opts.previousSha ?? null
  const notes = selectNotes(dir, opts.sha, notesAddedInRange(opts.root, prev, opts.sha))
  if (notes.length) {
    return combineNotes(notes, { sha: opts.sha, deployedAt: opts.deployedAt ? toNewYorkIso(opts.deployedAt) : null })
  }
  return noteFromCommits(commitsInRange(opts.root, prev, opts.sha), {
    sha: opts.sha,
    previousSha: prev,
    deployedAt: toNewYorkIso(opts.deployedAt ?? new Date()),
  })
}

export async function buildEmail(opts: BuildOptions): Promise<BuiltEmail> {
  let note = resolveNote(opts)
  let ciShots: CiShotsSummary | undefined
  if (opts.uiShotsDir !== undefined) {
    const r = attachCiShots(note, {
      root: opts.root,
      sha: opts.sha,
      previousSha: opts.previousSha ?? null,
      uiShotsDir: opts.uiShotsDir,
    })
    note = r.note
    ciShots = r.summary
  }
  const images = await prepareImages(note.screenshots, opts.imageProcessor)
  return { note, ...(ciShots ? { ciShots } : {}), ...renderEmail(note, images) }
}

/**
 * The JSON handed from the render step to the send step. Carries content
 * only. There is deliberately no recipient or sender field: send.ts takes
 * both from the environment and nowhere else.
 */
export interface EmailPayload {
  sha: string
  subject: string
  html: string
  text: string
  attachments: { filename: string; content: string; content_type: string; content_id: string }[]
}

export function toPayload(e: BuiltEmail): EmailPayload {
  return {
    sha: e.note.sha,
    subject: e.subject,
    html: e.html,
    text: e.text,
    attachments: e.images.map((i) => ({
      filename: i.filename,
      content: i.content.toString('base64'),
      content_type: i.contentType,
      content_id: i.cid,
    })),
  }
}

/** Minimal `--flag value` / `--flag` parser shared by the CLIs. */
export function parseArgs(argv: readonly string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (!a.startsWith('--')) continue
    const eq = a.indexOf('=')
    if (eq > 0) {
      out[a.slice(2, eq)] = a.slice(eq + 1)
      continue
    }
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      out[a.slice(2)] = next
      i++
    } else {
      out[a.slice(2)] = true
    }
  }
  return out
}
