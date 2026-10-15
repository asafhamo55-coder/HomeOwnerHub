/**
 * scripts/local-db-reset.ts
 *
 * Rebuilds the LOCAL Supabase database from the migration manifest.
 *
 * Refuses to run against anything but loopback. This script drops the
 * public schema; pointing it at production would be unrecoverable.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MIGRATION_MANIFEST, SCHEMA_SEEDS, STORAGE_BUCKETS } from '../tests/integration/schema/manifest'

const REPO_ROOT = resolve(__dirname, '..')
const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function assertLoopback(conn: string): void {
  if (!/@(127\.0\.0\.1|localhost|\[::1\]):/.test(conn)) {
    throw new Error(`local-db-reset: refusing to run against non-loopback: ${conn.replace(/:[^:@]*@/, ':***@')}`)
  }
}

function psql(sql: string): void {
  execFileSync('psql', [LOCAL_DB, '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql], { stdio: ['ignore', 'ignore', 'inherit'] })
}

function psqlFile(path: string): void {
  execFileSync('psql', [LOCAL_DB, '-v', 'ON_ERROR_STOP=1', '-q', '-f', path], { stdio: ['ignore', 'ignore', 'inherit'] })
}

function main(): void {
  assertLoopback(LOCAL_DB)

  // Drop and recreate public so replay starts from genuinely empty. This
  // is the first time these migrations have ever been applied from
  // scratch; a failure here is a real finding, not a script bug.
  psql('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')
  psql('GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;')

  let applied = 0
  for (const name of MIGRATION_MANIFEST) {
    const path = resolve(REPO_ROOT, 'migrations', name)
    readFileSync(path) // fail loudly if the manifest names a missing file
    try {
      psqlFile(path)
    } catch {
      throw new Error(`local-db-reset: migration FAILED at ${name} (after ${applied} applied)`)
    }
    applied += 1
  }
  console.log(`[local-db-reset] applied ${applied}/${MIGRATION_MANIFEST.length} migrations`)

  for (const bucket of STORAGE_BUCKETS) {
    psql(`INSERT INTO storage.buckets (id, name, public) VALUES ('${bucket}', '${bucket}', false) ON CONFLICT (id) DO NOTHING;`)
  }
  console.log(`[local-db-reset] ensured ${STORAGE_BUCKETS.length} storage buckets`)

  for (const seed of SCHEMA_SEEDS) {
    psqlFile(resolve(REPO_ROOT, 'migrations', seed))
  }
  console.log(`[local-db-reset] applied ${SCHEMA_SEEDS.length} schema seed(s)`)
}

main()
