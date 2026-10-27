/**
 * Raw SQL against the local test database, for the few assertions that need
 * the catalog (pg_proc, pg_trigger, pg_policies) or a row the API refuses to
 * create (a "legacy" planted row written with triggers off).
 *
 * psql over execFileSync, like storage-isolation.test.ts: no `pg` dependency.
 * Runs as the database owner, so it bypasses RLS: use it to SEED or to read
 * the catalog, never for an isolation assertion about a user. CI only.
 */
import { execFileSync } from 'node:child_process'
import { LOCAL_DB_URL, assertLoopbackOrDie } from '../setup/env'

/** Runs a statement (or several) and discards the output. Throws on error. */
export function psqlExec(sql: string): void {
  assertLoopbackOrDie(LOCAL_DB_URL.replace(/^postgresql/, 'http'))
  execFileSync('psql', [LOCAL_DB_URL, '-X', '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql], {
    stdio: ['ignore', 'ignore', 'inherit'],
    timeout: 20_000,
  })
}

/** Runs one SELECT and returns its rows as objects (via json_agg). */
export function psqlRows<T = Record<string, unknown>>(select: string): T[] {
  assertLoopbackOrDie(LOCAL_DB_URL.replace(/^postgresql/, 'http'))
  const out = execFileSync(
    'psql',
    [
      LOCAL_DB_URL,
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-tAc',
      `select coalesce(json_agg(t), '[]'::json) from (${select}) t`,
    ],
    { stdio: ['ignore', 'pipe', 'inherit'], timeout: 20_000 },
  )
  return JSON.parse(out.toString().trim()) as T[]
}

/**
 * Runs one SELECT as the `authenticated` role with the given JWT claims (or,
 * with `claims = null`, as `anon` with none). Lets a test exercise a user
 * whose token has no email claim, which GoTrue password sign-in cannot mint.
 * Returns the rows of the SELECT as objects.
 */
export function psqlAsJwt<T = Record<string, unknown>>(claims: Record<string, unknown> | null, select: string): T[] {
  assertLoopbackOrDie(LOCAL_DB_URL.replace(/^postgresql/, 'http'))
  const role = claims ? 'authenticated' : 'anon'
  const json = JSON.stringify(claims ?? {}).replace(/'/g, "''")
  const out = execFileSync(
    'psql',
    [
      LOCAL_DB_URL,
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-tA',
      '-c',
      `begin; set local role ${role}; select set_config('request.jwt.claims', '${json}', true); ` +
        `select coalesce(json_agg(t), '[]'::json) from (${select}) t; rollback;`,
    ],
    { stdio: ['ignore', 'pipe', 'inherit'], timeout: 20_000 },
  )
  // Each statement may print a line; the JSON result is the last one.
  const lines = out.toString().split('\n').map((l) => l.trim()).filter((l) => l.startsWith('['))
  return JSON.parse(lines[lines.length - 1] ?? '[]') as T[]
}
