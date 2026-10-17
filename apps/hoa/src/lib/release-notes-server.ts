import { promises as fs } from 'node:fs'
import path from 'node:path'
import { parseReleaseNote, sortReleaseNotes, type ReleaseNote } from './release-notes'

// Reads docs/releases/*.md from the repo. next.config.ts traces the folder
// into the /whats-new bundle (outputFileTracingIncludes), so the files ship
// with the deploy. A missing folder is "no notes yet" (ok, empty); any
// other read error is a failure, never shown as an empty list.

export type ReleaseNotesResult = { ok: true; notes: ReleaseNote[] } | { ok: false }

/** process.cwd() is apps/hoa in `next build`/`next start`; the repo root otherwise. */
function releasesDir(): string {
  const cwd = process.cwd()
  const fromApp = path.resolve(cwd, '../../docs/releases')
  return path.basename(cwd) === 'hoa' ? fromApp : path.resolve(cwd, 'docs/releases')
}

export async function loadReleaseNotes(): Promise<ReleaseNotesResult> {
  const dir = releasesDir()
  let files: string[]
  try {
    files = await fs.readdir(dir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ok: true, notes: [] }
    return { ok: false }
  }
  try {
    const notes = await Promise.all(
      files
        .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
        .map(async (f) => parseReleaseNote(f, await fs.readFile(path.join(dir, f), 'utf8'))),
    )
    return { ok: true, notes: sortReleaseNotes(notes.filter((n): n is ReleaseNote => n !== null)) }
  } catch {
    return { ok: false }
  }
}
