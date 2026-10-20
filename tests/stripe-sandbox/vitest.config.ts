import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const here = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(here, '../..')

// BL-103 Stripe sandbox suite (docs/specs/2026-10-19-stripe-sandbox.md).
// Separate from vitest.config.ts (pure, hermetic, no network) and from the
// integration suite (local Postgres): this one talks to Stripe TEST mode
// and nothing else. No database of any kind is used.
//
// Runs only when STRIPE_TEST_SECRET_KEY starts with sk_test_; otherwise
// every case is skipped with a message. A live key anywhere in the
// environment fails the run before any test file loads.
export default defineConfig({
  root: rootDir,
  test: {
    include: ['tests/stripe-sandbox/*.sandbox.test.ts'],
    // Once, in the main process: refuse live keys, print the banner, sweep
    // a crashed run's leftovers.
    globalSetup: ['tests/stripe-sandbox/global-setup.ts'],
    // Per worker, before any app module reads process.env.
    setupFiles: ['tests/stripe-sandbox/setup.ts'],
    environment: 'node',
    // Serial keeps us far from test-mode rate limits and the log readable.
    fileParallelism: false,
    // Test clocks and ACH settle asynchronously.
    testTimeout: 180_000,
    hookTimeout: 180_000,
    clearMocks: true,
    passWithNoTests: false,
  },
  resolve: {
    alias: { '@': path.resolve(rootDir, 'apps/hoa/src') },
  },
})
