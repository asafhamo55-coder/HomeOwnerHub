/**
 * The wiring contract.
 *
 * Two failure modes have each shipped to production here:
 *   - a job defined and exported but never registered in serve(), so its
 *     cron silently does not exist (recurringJeJob, plaidSyncJob)
 *   - an inngest.send() event name with no registered listener
 *
 * Both are invisible at runtime: no error, no log, just nothing
 * happening. This test reads the source so it cannot be fooled by a
 * mock, and it is cheap enough to run forever.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(__dirname, '../../..')

function read(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8')
}

/** Strips line comments and block comments from a source fragment. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

/**
 * Jobs re-exported from packages/jobs — the public job surface.
 *
 * Parses `export { a, b, c } from '...'` lines properly (multiple symbols
 * per line, renamed symbols via `as`), rather than assuming one symbol per
 * export statement. `export type { ... }` lines never match: `\s+\{`
 * requires `{` to follow `export` after whitespace only, and `type` sits
 * in between.
 */
function exportedJobNames(): string[] {
  const src = read('packages/jobs/src/index.ts')
  const names: string[] = []
  for (const m of src.matchAll(/^export\s+\{([^}]*)\}/gm)) {
    for (const entry of m[1].split(',')) {
      const trimmed = entry.trim()
      if (!trimmed) continue
      // A renamed export (`x as fooJob`) exposes the name after `as`, not
      // the local module symbol before it.
      const asMatch = trimmed.match(/\bas\s+(\w+)$/)
      const exposedName = asMatch ? asMatch[1] : trimmed
      if (/Job$/.test(exposedName)) names.push(exposedName)
    }
  }
  return [...new Set(names)].sort()
}

/** Extracts the `functions: [...]` array body as raw text. */
function functionsArrayBody(): string {
  const src = read('apps/hoa/src/app/api/inngest/route.ts')
  const block = src.match(/functions:\s*\[([\s\S]*?)\]/)
  if (!block) throw new Error('inngest route: could not find the functions: [...] array')
  return block[1]
}

/**
 * Jobs listed in the serve() functions array.
 *
 * Takes raw array-body text (rather than reading the file itself) so this
 * parsing logic can be exercised directly against a fixture in a test —
 * see "does not count a commented-out entry as registered" below.
 * Comments are stripped first: a job commented out of the array (e.g.
 * disabled pending an incident) must not read as registered.
 */
function registeredJobNamesIn(blockText: string): string[] {
  const withoutComments = stripComments(blockText)
  return [...new Set([...withoutComments.matchAll(/(\w+Job)/g)].map((m) => m[1]))].sort()
}

function registeredJobNames(): string[] {
  return registeredJobNamesIn(functionsArrayBody())
}

/**
 * Every inngest.send({ name: '...' }) across the repo.
 *
 * Limitation (deferred, documented rather than fixed): the pattern
 * `[a-z]+/[a-z.]+` only matches lowercase letters and dots, so an event
 * name containing a digit, hyphen, or underscore would silently not be
 * found. All four event names in this repo today fit the pattern.
 */
function sentEventNames(): string[] {
  const out = execFileSync(
    'grep',
    [
      '-rhoE',
      "name:\\s*'[a-z]+/[a-z.]+'",
      '--include=*.ts',
      '--include=*.tsx',
      '--exclude-dir=node_modules',
      'apps',
      'packages',
    ],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
  const names = [...out.matchAll(/'([a-z]+\/[a-z.]+)'/g)].map((m) => m[1])
  return [...new Set(names)].sort()
}

/** Every { event: '...' } trigger in packages/jobs. Same pattern limitation as above. */
function listenedEventNames(): string[] {
  const out = execFileSync(
    'grep',
    [
      '-rhoE',
      "event:\\s*'[a-z]+/[a-z.]+'",
      '--include=*.ts',
      '--exclude-dir=node_modules',
      'packages/jobs/src',
    ],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
  const names = [...out.matchAll(/'([a-z]+\/[a-z.]+)'/g)].map((m) => m[1])
  return [...new Set(names)].sort()
}

describe('inngest wiring contract', () => {
  it('finds every job export, including multi-symbol export lines', () => {
    const exported = exportedJobNames()
    // Pins the count so this parser's blind spot (it used to miss every
    // job sharing a multi-symbol `export { a, b } from '...'` line) cannot
    // silently regress. If a new job is added to packages/jobs, this
    // assertion fails loudly — the correct outcome for a contract test.
    expect(exported).toHaveLength(16)
    expect(exported).toEqual(
      expect.arrayContaining(['mailboxSyncJob', 'mailboxWatchdogJob', 'mailboxReconcileJob']),
    )
  })

  it('every exported job is registered in serve()', () => {
    const exported = exportedJobNames()
    const registered = registeredJobNames()
    expect(exported.length).toBeGreaterThan(0)
    const unregistered = exported.filter((j) => !registered.includes(j))
    expect(
      unregistered,
      `exported but never registered — their crons do not exist on the platform: ${unregistered.join(', ')}`,
    ).toEqual([])
  })

  it('does not count a commented-out entry as registered', () => {
    const fixture = `
      dailyDigestJob,
      // recurringJeJob, // disabled pending INC-123
      plaidSyncJob,
    `
    expect(registeredJobNamesIn(fixture)).toEqual(['dailyDigestJob', 'plaidSyncJob'])
  })

  it('every sent event has a registered listener', () => {
    const sent = sentEventNames()
    const listened = listenedEventNames()
    expect(sent.length).toBeGreaterThan(0)
    const orphaned = sent.filter((e) => !listened.includes(e))
    expect(orphaned, `sent with no listener: ${orphaned.join(', ')}`).toEqual([])
  })
})
