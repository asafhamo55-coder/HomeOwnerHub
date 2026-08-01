import { expect, test } from '@playwright/test'

/**
 * Inbox smoke test. Does NOT exercise Google OAuth — that needs a real
 * consent screen (see the brief's Step 6 live-verification checklist,
 * done by hand). It verifies the surfaces render and degrade correctly:
 * no mailbox connected yet, the settings page offers exactly one connect
 * path, that path targets the real OAuth start route, and onboarding
 * surfaces the mailbox step in its checklist.
 *
 * Requires a logged-in storage state (an authenticated board/admin
 * session — the inbox and settings routes are board-only per the
 * `board_access` RLS policy in migrations/0029_inbox.sql). No Playwright
 * config or other spec exists in this repo yet to copy an auth pattern
 * from; wire this up per whatever project-wide Playwright config and
 * `storageState` convention is adopted when e2e is turned on (e.g. a
 * `playwright.config.ts` `use.storageState` pointing at a pre-authenticated
 * session fixture, or a `test.beforeEach` that signs in a seeded board
 * user). Do not run this file against a real mailbox or real resident
 * data — it asserts on UI copy only, never on email content.
 */

test('inbox prompts to connect when no mailbox exists', async ({ page }) => {
  await page.goto('/inbox')
  await expect(page.getByText(/no mailbox connected/i)).toBeVisible()
  await expect(page.getByRole('link', { name: /connect/i })).toBeVisible()
})

test('settings mailbox page offers a single Google button', async ({ page }) => {
  await page.goto('/settings/mailbox')
  await expect(page.getByRole('link', { name: /continue with google/i })).toBeVisible()
})

test('connect link targets the OAuth start route', async ({ page }) => {
  await page.goto('/settings/mailbox')
  const link = page.getByRole('link', { name: /continue with google/i })
  await expect(link).toHaveAttribute('href', /\/api\/oauth\/google\/start/)
})

test('onboarding setup shows the checklist with mailbox highlighted', async ({ page }) => {
  await page.goto('/onboarding/setup')
  await expect(page.getByText(/connect your hoa mailbox/i)).toBeVisible()
  await expect(page.getByText(/of 4 done/i)).toBeVisible()
})
