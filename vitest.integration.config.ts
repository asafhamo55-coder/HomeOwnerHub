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
    environment: 'node',
    // These tests share one database. Parallel files would interleave
    // truncation with other files' fixtures.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    clearMocks: true,
    passWithNoTests: false,
  },
  resolve: {
    alias: { '@': path.resolve(rootDir, 'apps/hoa/src') },
  },
})
