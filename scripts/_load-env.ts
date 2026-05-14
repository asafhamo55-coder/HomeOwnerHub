/**
 * scripts/_load-env.ts
 *
 * Tiny zero-dep loader that hydrates process.env from the project's
 * .env.local files. Imported (for side effects) at the top of every
 * script in scripts/ so contributors don't have to remember to
 * `set -a; source apps/hoa/.env.local; set +a` before each invocation.
 *
 * Search order (first match wins per key; shell-set env always wins):
 *   1. apps/hoa/.env.local        ← dev source-of-truth per docs/DEPLOY.md
 *   2. <repo-root>/.env.local
 *   3. <repo-root>/.env
 *
 * Variables already present in process.env (i.e. set by the shell) are
 * NEVER overwritten — explicit `FOO=bar pnpm script` wins.
 *
 * Parser handles: KEY=VALUE pairs, optional surrounding quotes,
 * `#` comments, blank lines, and the `export KEY=VALUE` prefix. It
 * does NOT do variable interpolation (`${OTHER_VAR}`) — keep it simple.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(__dirname, '..')

const CANDIDATE_FILES = [
  resolve(REPO_ROOT, 'apps/hoa/.env.local'),
  resolve(REPO_ROOT, '.env.local'),
  resolve(REPO_ROOT, '.env'),
]

let loadedFrom: string[] = []

for (const file of CANDIDATE_FILES) {
  if (!existsSync(file)) continue
  const contents = readFileSync(file, 'utf8')
  const added = mergeIntoEnv(contents)
  if (added > 0) {
    loadedFrom.push(`${file} (${added} keys)`)
  }
}

if (loadedFrom.length > 0 && process.env.HOMEOWNER_PORTAL_ENV_QUIET !== '1') {
  console.error(`[env] Loaded: ${loadedFrom.join(', ')}`)
}

function mergeIntoEnv(contents: string): number {
  let added = 0
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith('#')) continue
    const stripped = line.startsWith('export ') ? line.slice(7) : line
    const eq = stripped.indexOf('=')
    if (eq <= 0) continue
    const key = stripped.slice(0, eq).trim()
    let value = stripped.slice(eq + 1).trim()
    // Strip surrounding single or double quotes (but only if matched).
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) {
      process.env[key] = value
      added += 1
    }
  }
  return added
}
