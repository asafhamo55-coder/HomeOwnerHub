/**
 * scripts/e2e-impersonation.ts
 *
 * Full end-to-end test for the admin "enter owner portal" impersonation
 * feature, driven through the REAL running app (Next.js server actions,
 * middleware, RLS/service-role reads) with a headless Chromium browser.
 *
 * It authenticates as a real admin via the app's /auth/dev-login route,
 * auto-discovers a property + owner to test against from Supabase, then
 * asserts the full flow:
 *
 *   1. Admin lands on a property page and sees the "Enter portal" control.
 *   2. Clicking it opens /resident showing THAT OWNER's data + a read-only
 *      "Viewing <name>'s portal" banner.
 *   3. A resident write (open a ticket) is REFUSED while impersonating.
 *   4. Exit returns to the property page.
 *
 * Prerequisites (only you can provide these — they are secrets):
 *   - apps/hoa/.env.local populated with real Supabase creds. Easiest:
 *       cd apps/hoa && vercel env pull .env.local
 *   - Playwright's Chromium browser installed:
 *       pnpm exec playwright install chromium
 *
 * Usage (from repo root):
 *   pnpm tsx scripts/e2e-impersonation.ts
 *
 * Optional overrides (skip auto-discovery):
 *   E2E_ADMIN_EMAIL=...  E2E_PROPERTY_ID=...  pnpm tsx scripts/e2e-impersonation.ts
 *
 * Exit codes: 0 all green · 1 a step failed · 2 preconditions missing.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Browser } from 'playwright'

const ROOT = process.cwd()
const HOA_DIR = join(ROOT, 'apps/hoa')
const PORT = Number(process.env.E2E_PORT ?? 3000)
const BASE = `http://localhost:${PORT}`
const READONLY_MSG = 'Read-only while viewing as a resident'

// ── tiny logger ──────────────────────────────────────────────────────
let failures = 0
function step(ok: boolean, label: string, detail = ''): void {
  const icon = ok ? '✓' : '✗'
  if (!ok) failures++
  // eslint-disable-next-line no-console
  console.log(`${icon} ${label}${detail ? ` — ${detail}` : ''}`)
}
function info(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`  ${msg}`)
}
function die(code: number, msg: string): never {
  // eslint-disable-next-line no-console
  console.error(`\n✗ ${msg}`)
  process.exit(code)
}

// ── env ──────────────────────────────────────────────────────────────
function loadEnv(): Record<string, string> {
  const raw = readFileSync(join(HOA_DIR, '.env.local'), 'utf8')
  const out: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
  return out
}

async function waitForServer(timeoutMs = 90_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`, {
        signal: AbortSignal.timeout(3000),
      })
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error(`dev server did not become healthy on ${BASE} in time`)
}

// ── main ─────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const env = loadEnv()
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    die(
      2,
      'apps/hoa/.env.local is missing Supabase creds. Run:  cd apps/hoa && vercel env pull .env.local',
    )
  }

  // 1) Discover a real admin + property + owner to drive against.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let adminEmail = process.env.E2E_ADMIN_EMAIL ?? ''
  let propertyId = process.env.E2E_PROPERTY_ID ?? ''
  let ownerName = ''
  let ownerEmail = ''

  if (!adminEmail || !propertyId) {
    info('Auto-discovering an admin + property with an owner…')
    // An org that has an admin member.
    const { data: adminMember } = await admin
      .from('org_members')
      .select('org_id, user_id, role, profiles(email)')
      .eq('role', 'admin')
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle<{ org_id: string; user_id: string; profiles: { email: string | null } | null }>()
    if (!adminMember) die(2, 'No admin org_member found in Supabase to test with.')
    adminEmail = adminEmail || adminMember.profiles?.email || ''
    if (!adminEmail) die(2, 'Admin member has no email on their profile.')

    // A property in that org with an owner on file.
    const { data: prop } = await admin
      .from('hoa_properties')
      .select('id, owner_name, owner_email, org_id')
      .eq('org_id', adminMember.org_id)
      .not('owner_email', 'is', null)
      .limit(1)
      .maybeSingle<{ id: string; owner_name: string | null; owner_email: string | null }>()
    if (!prop) die(2, `No property with an owner_email found in org ${adminMember.org_id}.`)
    propertyId = prop.id
    ownerName = prop.owner_name ?? prop.owner_email ?? ''
    ownerEmail = prop.owner_email ?? ''
  }

  info(`admin:    ${adminEmail}`)
  info(`property: ${propertyId}`)
  info(`owner:    ${ownerName || '(resolved at runtime)'} <${ownerEmail}>`)

  // 2) Boot the app with dev auto-login enabled for our admin.
  info('Starting next dev (this can take ~20s to compile)…')
  const server: ChildProcess = spawn('pnpm', ['--filter', 'hoa', 'dev'], {
    cwd: ROOT,
    env: {
      ...process.env,
      DEV_AUTOLOGIN: '1',
      DEV_AUTOLOGIN_EMAIL: adminEmail,
      PORT: String(PORT),
    },
    stdio: 'ignore',
  })

  let browser: Browser | null = null
  try {
    await waitForServer()
    step(true, 'dev server healthy', BASE)

    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()

    // 3) Land on the property page as an authenticated admin.
    await page.goto(`${BASE}/auth/dev-login?redirect=/properties/${propertyId}`, {
      waitUntil: 'networkidle',
    })
    const onProperty = page.url().includes(`/properties/${propertyId}`)
    step(onProperty, 'admin authenticated + on property page', page.url())

    // 4) "Enter portal" control is present for the admin.
    const enterBtn = page.getByRole('button', { name: /Enter portal/i }).first()
    await enterBtn.waitFor({ state: 'visible', timeout: 15_000 })
    step(true, '"Enter portal" control visible on property page')

    // 5) Click it → resident portal for the owner.
    await enterBtn.click()
    await page.waitForURL(/\/resident(\/|$)/, { timeout: 20_000 })
    step(true, 'clicking Enter portal navigates to /resident', page.url())

    // 6) Read-only impersonation banner naming the owner.
    const banner = page.getByText(/Viewing .* portal as an admin/i).first()
    await banner.waitFor({ state: 'visible', timeout: 15_000 })
    const bannerText = (await banner.textContent())?.trim() ?? ''
    step(true, 'read-only impersonation banner shown', bannerText)

    // 7) The portal shows the OWNER's identity, not the admin's. The
    //    dashboard greets by the owner's first name / shows their units.
    const bodyText = (await page.textContent('body')) ?? ''
    const ownerFirst = (ownerName || ownerEmail).split(/[\s@]/)[0]
    const showsOwner =
      ownerFirst.length > 0 &&
      new RegExp(ownerFirst.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(bannerText + bodyText)
    step(showsOwner, "portal reflects the OWNER's identity", `looked for “${ownerFirst}”`)

    // 8) Resident WRITE is refused while impersonating (read-only).
    await page.goto(`${BASE}/resident/tickets/new`, { waitUntil: 'networkidle' })
    const unitSelect = page.locator('select[name="unit_id"]')
    const unitOptions = await unitSelect.locator('option:not([disabled])').count()
    if (unitOptions > 0) {
      await unitSelect.selectOption({ index: 0 })
      await page.locator('select[name="category"]').selectOption('maintenance')
      await page.locator('input[name="subject"]').fill('E2E read-only probe')
      await page
        .locator('textarea[name="description"]')
        .fill('This submission should be refused because an admin is impersonating.')
      await page.getByRole('button', { name: /Submit ticket/i }).click()
      const err = page.getByText(new RegExp(READONLY_MSG, 'i')).first()
      await err.waitFor({ state: 'visible', timeout: 15_000 })
      step(true, 'resident write (open ticket) REFUSED while impersonating', READONLY_MSG)
    } else {
      step(true, 'read-only write check SKIPPED', 'impersonated owner has no linked unit to file a ticket for')
    }

    // 9) Exit returns to the property page.
    await page.goto(`${BASE}/resident`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /^Exit$/i }).first().click()
    await page.waitForURL(new RegExp(`/properties/${propertyId}`), { timeout: 20_000 })
    step(true, 'Exit clears impersonation + returns to property page', page.url())

    // 10) After exit, the admin is no longer treated as a resident.
    await page.goto(`${BASE}/resident`, { waitUntil: 'networkidle' })
    const bouncedOut = !/\/resident(\/|$)/.test(page.url())
    step(bouncedOut, 'after exit, admin is bounced from /resident', page.url())
  } finally {
    if (browser) await browser.close()
    server.kill('SIGTERM')
  }

  // eslint-disable-next-line no-console
  console.log('')
  if (failures > 0) {
    // eslint-disable-next-line no-console
    console.log(`Result: ${failures} step(s) FAILED`)
    process.exit(1)
  }
  // eslint-disable-next-line no-console
  console.log('Result: all steps passed ✓')
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[e2e-impersonation] unexpected:', err)
  process.exit(1)
})
