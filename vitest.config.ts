import { defineConfig } from 'vitest/config'

// Root-level unit-test harness. Scope is deliberately narrow: PURE
// modules only — no Supabase, no Next server components, no network.
// Anything that needs real Postgres belongs in scripts/test-*.ts
// following the scripts/test-comms.ts pattern instead.
export default defineConfig({
  test: {
    include: [
      'packages/mailbox/src/**/*.test.ts',
      'apps/hoa/src/lib/properties/**/*.test.ts',
      'apps/hoa/src/lib/inbox/**/*.test.ts',
    ],
    environment: 'node',
    passWithNoTests: false,
  },
})
