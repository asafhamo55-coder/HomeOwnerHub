// Glue between git, the note files and the renderer. The CLIs (render.ts,
// send.ts) are thin wrappers around buildEmail().

import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { renderEmail, type RenderedEmail } from './email'
import { noteFromCommits, toNewYorkIso, type Commit } from './fallback'
import { prepareImages, type ImageProcessor } from './images'
import { combineNotes, selectNotes, type ReleaseNote } from './note'

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
}

export interface BuiltEmail extends RenderedEmail {
  note: ReleaseNote
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
  const note = resolveNote(opts)
  const images = await prepareImages(note.screenshots, opts.imageProcessor)
  return { note, ...renderEmail(note, images) }
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
