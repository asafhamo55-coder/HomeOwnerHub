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
    include: [
      'packages/mailbox/src/**/*.test.ts',
      'packages/workflows/src/**/*.test.ts',
      'packages/jobs/src/**/*.test.ts',
      'apps/hoa/src/lib/properties/**/*.test.ts',
      'apps/hoa/src/lib/inbox/**/*.test.ts',
      'apps/hoa/src/app/\\(dashboard\\)/settings/mailbox/**/*.test.ts',
    ],
    environment: 'node',
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
