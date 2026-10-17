/**
 * Between-test reset.
 *
 * Truncation, not transaction rollback: PostgREST and GoTrue hold their
 * own connections, so a transaction held open by the test process cannot
 * wrap what they do.
 *
 * `orgs` is the cascade root for tenant data, and auth.users is cleared
 * separately because org_members.user_id FKs to profiles(id), which FKs
 * to auth.users.
 */
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { LOCAL_DB_URL, assertLoopbackOrDie } from '../setup/env'

const execFileAsync = promisify(execFile)

const SEED_COMMUNITY_TEMPLATES = resolve(__dirname, '../../../migrations/seed-community-templates.sql')

export async function truncateAll(): Promise<void> {
  assertLoopbackOrDie(LOCAL_DB_URL.replace(/^postgresql/, 'http'))

  // `TRUNCATE ... CASCADE` on `orgs` does NOT respect the WHERE below, or
  // any ON DELETE semantics: Postgres truncates every table that
  // references `orgs` (including communication_templates) IN FULL,
  // regardless of whether a given row's organization_id is NULL. So the
  // global community templates (organization_id IS NULL), which are a
  // schema seed rather than a per-test fixture, get wiped along with
  // everything else — the DELETE's WHERE clause never gets a chance to
  // matter, because by the time it runs the table is already empty.
  // Re-applying the idempotent seed below (same file local-db-reset.ts
  // uses) is what actually preserves them across a reset.
  //
  // DEVIATION from brief: `storage.objects` carries a `protect_delete()`
  // BEFORE DELETE trigger (not visible in migrations/ — it's part of the
  // Supabase Storage extension's own schema) that raises unless the
  // session sets `storage.allow_delete_query = 'true'` first. Without
  // this SET, a bare DELETE fails with "Direct deletion from storage
  // tables is not allowed." This is a test harness tearing down its own
  // fixtures directly via psql, not the app, so bypassing the guard here
  // is intentional.
  // lock_timeout: TRUNCATE needs ACCESS EXCLUSIVE on every tenant table.
  // If anything else holds a lock on one, fail in seconds with Postgres's
  // own "canceling statement due to lock timeout" rather than waiting.
  const sql = `
    SET lock_timeout = '10s';
    SET storage.allow_delete_query = 'true';
    TRUNCATE TABLE public.orgs CASCADE;
    DELETE FROM public.communication_templates WHERE organization_id IS NOT NULL;
    DELETE FROM auth.users;
    DELETE FROM storage.objects;
  `
  // Both statements run in one psql invocation (not two psql
  // calls) so a second process isn't spawned per test — the reseed would
  // otherwise double truncateAll's per-call overhead across the suite.
  // ASYNC, deliberately. This used to be execFileSync, which freezes the
  // worker's event loop for as long as psql waits, so vitest's 30s
  // hookTimeout could not fire: a lock wait became a 1009s "hang" that
  // was then reported as a 30s timeout.
  try {
    await execFileAsync(
      'psql',
      [LOCAL_DB_URL, '-X', '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql, '-f', SEED_COMMUNITY_TEMPLATES],
      { timeout: 25_000, killSignal: 'SIGKILL' },
    )
  } catch (e) {
    const err = e as { stderr?: string; killed?: boolean; message: string }
    throw new Error(
      `truncateAll failed${err.killed ? ' (psql killed after 25s)' : ''}: ` +
        `${(err.stderr ?? '').split('\n').filter((l) => /ERROR|FATAL/.test(l)).join(' ') || err.message}`,
    )
  }
}
