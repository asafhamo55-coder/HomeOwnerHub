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
import { execFileSync } from 'node:child_process'
import { LOCAL_DB_URL, assertLoopbackOrDie } from '../setup/env'

export async function truncateAll(): Promise<void> {
  assertLoopbackOrDie(LOCAL_DB_URL.replace(/^postgresql/, 'http'))

  // Global templates (organization_id IS NULL) are schema seeds, not
  // fixtures — preserve them. Everything tenant-scoped goes.
  //
  // DEVIATION from brief: `storage.objects` carries a `protect_delete()`
  // BEFORE DELETE trigger (not visible in migrations/ — it's part of the
  // Supabase Storage extension's own schema) that raises unless the
  // session sets `storage.allow_delete_query = 'true'` first. Without
  // this SET, a bare DELETE fails with "Direct deletion from storage
  // tables is not allowed." This is a test harness tearing down its own
  // fixtures directly via psql, not the app, so bypassing the guard here
  // is intentional.
  const sql = `
    SET storage.allow_delete_query = 'true';
    TRUNCATE TABLE public.orgs CASCADE;
    DELETE FROM public.communication_templates WHERE organization_id IS NOT NULL;
    DELETE FROM auth.users;
    DELETE FROM storage.objects;
  `
  execFileSync('psql', [LOCAL_DB_URL, '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql], {
    stdio: ['ignore', 'ignore', 'inherit'],
  })
}
