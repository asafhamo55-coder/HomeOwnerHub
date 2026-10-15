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

function psqlScalar(sql: string): string {
  return execFileSync('psql', [LOCAL_DB, '-v', 'ON_ERROR_STOP=1', '-tAc', sql], { stdio: ['ignore', 'pipe', 'inherit'] })
    .toString()
    .trim()
}

function main(): void {
  assertLoopback(LOCAL_DB)

  // Drop and recreate public so replay starts from genuinely empty. This
  // is the first time these migrations have ever been applied from
  // scratch; a failure here is a real finding, not a script bug.
  psql('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')

  // DROP SCHEMA ... CASCADE also wipes Supabase's ALTER DEFAULT PRIVILEGES
  // configuration on the schema. Without resetting it here, every table
  // the migrations create below gets no grants at all: the schema is
  // structurally correct but completely unreachable through PostgREST
  // (every query comes back "permission denied"), while psql as the
  // postgres superuser reads it as fine because superusers bypass grants.
  // Set this BEFORE any migration runs so every table inherits it at
  // creation time.
  //
  // Granting ALL to anon and authenticated (not just SELECT) is
  // deliberate, not an oversight: it's what a stock Supabase project
  // does. RLS is the protection layer here, not table grants — every
  // table in this schema has RLS enabled. Narrowing these grants would
  // diverge from production and would make the RLS policy tests prove
  // something weaker than they claim to prove. Do not tighten this.
  psql(`
    GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;
  `)

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

  // Sweep for anything created by a different role, or in a way the
  // default privileges above didn't cover. Same ALL-to-anon/authenticated
  // reasoning as above: RLS is the protection layer, not grants.
  psql(`
    GRANT ALL ON ALL TABLES    IN SCHEMA public TO postgres, anon, authenticated, service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
    GRANT ALL ON ALL ROUTINES  IN SCHEMA public TO postgres, anon, authenticated, service_role;
  `)

  // Verify through the roles that actually matter, not as the postgres
  // superuser — a superuser bypasses grants entirely, which is exactly
  // how the original version of this script shipped with no table grants
  // and still looked fine under every psql check.
  const grantsOk = psqlScalar(`
    select
      has_table_privilege('service_role', 'public.orgs', 'select')
      and has_table_privilege('authenticated', 'public.orgs', 'select')
      and has_table_privilege('anon', 'public.orgs', 'select');
  `)
  if (grantsOk !== 't') {
    throw new Error(
      `local-db-reset: grants verification FAILED — service_role/authenticated/anon cannot select public.orgs (got: ${grantsOk})`,
    )
  }
  console.log('[local-db-reset] grants verified: service_role/authenticated/anon can read public')
}

main()
