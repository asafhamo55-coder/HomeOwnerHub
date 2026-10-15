/**
 * Integration-test environment. Imported for side effects by
 * vitest.integration.config.ts BEFORE any application module loads.
 *
 * Why this file is load-bearing: packages/db/src/client.ts:5 reads
 *
 *   export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
 *
 * at MODULE SCOPE with no fallback, and createAdminClient() uses it. The
 * 22 scripts/test-*.ts harnesses resolve NEXT_PUBLIC_SUPABASE_URL ||
 * SUPABASE_URL. So a run configured with SUPABASE_URL alone writes test
 * rows locally while every createAdminClient consumer — Inngest job
 * bodies, ai_runs audit rows from packages/ai/src/workflow.ts:272 —
 * writes to PRODUCTION. Setting a subset of these names is the bug.
 *
 * Module-scope capture also means a beforeAll() override is too late.
 * This must run at import time.
 */

/** Default local stack values. `supabase start` prints these; they are the
 *  CLI's fixed demo keys, identical on every machine, and are not secrets. */
export const LOCAL_SUPABASE_URL = process.env.LOCAL_SUPABASE_URL ?? 'http://127.0.0.1:54321'
export const LOCAL_ANON_KEY =
  process.env.LOCAL_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
export const LOCAL_SERVICE_KEY =
  process.env.LOCAL_SUPABASE_SERVICE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
export const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

/**
 * Hard-stops the process unless `url` points at loopback. Throws rather
 * than warns: a warning in a 24/7 loop is a warning nobody reads.
 */
export function assertLoopbackOrDie(url: string): void {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    throw new Error(`integration tests: SUPABASE_URL is not a valid URL: ${JSON.stringify(url)}`)
  }
  // Exact match only. A substring test would accept localhost.evil.com.
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `integration tests: refusing to run against non-loopback host ${JSON.stringify(host)}. ` +
        `These tests truncate tables and create users. Start the local stack with \`supabase start\`.`,
    )
  }
}

/** Sets ALL SIX Supabase names together, then enforces the interlock. */
export function installLocalEnv(): void {
  assertLoopbackOrDie(LOCAL_SUPABASE_URL)

  process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_SUPABASE_URL
  process.env.SUPABASE_URL = LOCAL_SUPABASE_URL
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = LOCAL_ANON_KEY
  process.env.SUPABASE_ANON_KEY = LOCAL_ANON_KEY
  process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_SERVICE_KEY
  process.env.SUPABASE_SECRET_KEY = LOCAL_SERVICE_KEY

  // Short-circuits the only LLM call path in the test surface
  // (packages/workflows/src/W18-bank-reconciliation/index.ts:225-226).
  process.env.AI_API_KEY = 'local'

  // Fixed, valid-SHAPED VAPID keypair (65-byte public / 32-byte private,
  // base64url — the only thing packages/jobs/src/web-push.ts validates at
  // setVapidDetails() time). Not a real keypair and never used to sign an
  // actual push: no integration test seeds push_subscriptions, so
  // sendPushToUsers' subs.length === 0 guard returns before any network
  // call. Without this, ensureConfigured() logs "VAPID keys not set" on
  // every ticket-notifications run, which the idempotency/row-count tests
  // then see as an unexpected warning.
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY =
    'RjYMBTDeoSdFqPiXw0iSeQiKHUNN55UET4noGvcW2ypSK4nAM7vlIso4dOVyucsbqYTA0k3r-xtOYqBU8Vq9PIU'
  process.env.VAPID_PRIVATE_KEY = '9LFtPSQoPPX-ZZu2Wg4miklPC2hzIenG0NEWXPJ9uis'

  // Belt and braces: re-read what the app will actually resolve.
  assertLoopbackOrDie(process.env.NEXT_PUBLIC_SUPABASE_URL)
  assertLoopbackOrDie(process.env.SUPABASE_URL)
}
