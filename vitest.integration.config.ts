import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// Integration suite. DELIBERATELY separate from vitest.config.ts, which
// is pure-module-only and must stay a ~4s hermetic run. Do not merge
// these: widening the root include globs is how the fast suite dies.
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    // Loaded before any test file, and therefore before any application
    // module captures process.env at import scope.
    setupFiles: ['tests/integration/setup/global.ts'],
    // Once per run, in the main process: take the cross-process local-DB
    // lock (one run per stack, across every worktree) and hold a macOS
    // idle-sleep assertion. Both were real causes of "different 1-3 tests
    // fail each full run"; see tests/integration/setup/suite-lock.ts.
    globalSetup: ['tests/integration/setup/global-setup.ts'],
    environment: 'node',
    // These tests share one database. Parallel files would interleave
    // truncation with other files' fixtures.
    fileParallelism: false,
    // These only fire if the event loop is free. Keep every DB/psql call
    // async (truncateAll is) so a stuck lock fails at 30s with a message,
    // instead of freezing the worker until the lock clears.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    clearMocks: true,
    passWithNoTests: false,
  },
  resolve: {
    alias: { '@': path.resolve(rootDir, 'apps/hoa/src') },
  },
})
