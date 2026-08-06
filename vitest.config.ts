import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// Root-level unit-test harness. Scope is deliberately narrow: PURE
// modules only — no Supabase, no Next server components, no network.
// Anything that needs real Postgres belongs in scripts/test-*.ts
// following the scripts/test-comms.ts pattern instead.
export default defineConfig({
  test: {
    // Two broad patterns, deliberately NOT a per-directory allowlist.
    //
    // This was an allowlist of eight specific globs, and it silently
    // excluded a whole package three separate times — packages/workflows,
    // packages/jobs, and apps/.../properties/[id] each landed a test file
    // that simply never ran. Every one was caught by chance, because the
    // author happened to notice their new tests missing from the count.
    //
    // The failure mode is the dangerous kind: a green suite that is not
    // running your test looks exactly like a green suite that is. An
    // allowlist also forces regex-escaping Next's route-group parens and
    // dynamic-segment brackets, which is where two of the three misses
    // came from.
    include: [
      'apps/**/src/**/*.test.{ts,tsx}',
      'packages/**/src/**/*.test.{ts,tsx}',
    ],
    environment: 'node',
    // Clear call history before every test.
    //
    // Without this, a file that resets only some of its mocks in beforeEach
    // leaks call state between cases, and any assertion of the form "this
    // was never called" becomes order-dependent. That produced an
    // intermittent failure in property-residents.test.ts's authorization
    // cases — "refuses before touching the database" passed or failed
    // depending on what ran first.
    //
    // A flaky AUTHORIZATION test is worse than a missing one: it gets
    // dismissed as noise, and a genuine regression looks identical to the
    // flake. clearMocks resets calls only, not implementations, so
    // vi.mock factories and mockResolvedValue set at module scope survive.
    clearMocks: true,
    passWithNoTests: false,
  },
  resolve: {
    alias: {
      // apps/hoa's tsconfig maps "@/*" -> "./src/*" (apps/hoa/tsconfig.json).
      // Vitest doesn't read tsconfig `paths` on its own, so any module under
      // the globs above that imports a same-app sibling via "@/..." (as the
      // codebase does everywhere else — see apps/hoa/src/lib/inbox/queries.ts
      // consumers) needs the alias mirrored here, or the import fails to
      // resolve outside a Next build.
      '@': path.resolve(rootDir, 'apps/hoa/src'),
    },
  },
})
