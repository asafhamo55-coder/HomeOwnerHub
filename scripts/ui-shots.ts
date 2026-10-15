/**
 * scripts/ui-shots.ts — `pnpm ui:shots`
 *
 * The visual check for agents (and anyone) without a human browser:
 * screenshots a fixed list of HOA routes at 375px and 1440px, light and
 * dark, into `.ui-shots/` (gitignored). Spec:
 * docs/specs/2026-10-15-design-system-v2.md § "Visual verification".
 *
 * What it does:
 *   1. Seeds a throwaway board admin + demo org into the LOCAL Supabase
 *      (loopback only — refuses anything else) so real pages render.
 *   2. Starts `next dev` for apps/hoa on :3100 pointed at local Supabase
 *      with DEV_AUTOLOGIN for that user (or reuses UI_SHOTS_URL).
 *   3. Visits each route in Chromium and writes
 *      .ui-shots/<route>--<width>-<theme>.png (full page).
 *
 * The component gallery (/ui-gallery, dev-only) needs no data or auth, so
 * it always works; app routes are skipped with a note if seeding fails.
 *
 * Flags / env:
 *   --only=<substr>        only routes whose name contains substr
 *   --gallery-only         skip app routes
 *   UI_SHOTS_URL=http://localhost:3000   use a server you already run
 *   UI_SHOTS_BROWSER=webkit               Safari engine (run
 *                                         `npx playwright install webkit` once)
 *
 * Logs ids and counts only — never names, emails or addresses.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium, webkit, type Browser } from 'playwright'

const ROOT = resolve(__dirname, '..')
const OUT = resolve(ROOT, '.ui-shots')
const PORT = 3100
const LOCAL_SUPABASE_URL = process.env.LOCAL_SUPABASE_URL ?? 'http://127.0.0.1:54321'
// The Supabase CLI's fixed demo keys — identical on every machine, not secrets
// (same values as tests/integration/setup/env.ts).
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const SHOTS_EMAIL = 'ui-shots-admin@example.test' // reserved TLD; never routes

interface Shot {
  name: string
  path: string
  /** Needs the seeded session. */
  auth?: boolean
  /** Render as a resident (admin role-override cookie). */
  resident?: boolean
  /** Desktop sidebar collapsed to the icon rail. */
  rail?: boolean
  widths?: number[]
  themes?: ('light' | 'dark')[]
}

const WIDTHS = [375, 1440]
const THEMES: ('light' | 'dark')[] = ['light', 'dark']

const SHOTS: Shot[] = [
  { name: 'gallery', path: '/ui-gallery' },
  { name: 'gallery-rail', path: '/ui-gallery', rail: true, widths: [1440] },
  { name: 'dashboard-rail', path: '/', auth: true, rail: true, widths: [1440], themes: ['light'] },
  { name: 'gallery-dialog', path: '/ui-gallery?overlay=dialog', themes: ['light'] },
  { name: 'gallery-sheet', path: '/ui-gallery?overlay=sheet', themes: ['light'] },
  { name: 'gallery-confirm', path: '/ui-gallery?overlay=confirm', themes: ['dark'] },
  { name: 'gallery-palette', path: '/ui-gallery?overlay=palette' },
  { name: 'gallery-menu', path: '/ui-gallery?overlay=menu', widths: [1440], themes: ['light'] },
  { name: 'gallery-toast', path: '/ui-gallery?overlay=toast', themes: ['light'] },
  { name: 'dashboard', path: '/', auth: true },
  { name: 'violations', path: '/violations', auth: true },
  { name: 'dues', path: '/dues', auth: true },
  { name: 'properties', path: '/properties', auth: true },
  { name: 'meetings', path: '/meetings', auth: true },
  { name: 'tickets', path: '/tickets', auth: true },
  { name: 'communications', path: '/communications', auth: true },
  { name: 'accounting', path: '/accounting', auth: true },
  { name: 'vendors', path: '/vendors', auth: true },
  { name: 'settings-members', path: '/settings/members', auth: true },
  { name: 'admin', path: '/admin', auth: true, themes: ['light'] },
  { name: 'resident', path: '/resident', auth: true, resident: true },
  { name: 'resident-dues', path: '/resident/dues', auth: true, resident: true, themes: ['light'] },
]

function assertLoopback(url: string) {
  const host = new URL(url).hostname
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
    throw new Error(`ui-shots: refusing non-loopback Supabase host ${JSON.stringify(host)}`)
  }
}

/** Idempotent: a board-admin user in a small demo org on the LOCAL stack. */
async function seed(): Promise<boolean> {
  assertLoopback(LOCAL_SUPABASE_URL)
  const db = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  try {
    // User.
    let userId: string | null = null
    const created = await db.auth.admin.createUser({ email: SHOTS_EMAIL, email_confirm: true, password: crypto.randomUUID() })
    if (created.data.user) userId = created.data.user.id
    else {
      for (let page = 1; page <= 20 && !userId; page++) {
        const { data } = await db.auth.admin.listUsers({ page, perPage: 200 })
        userId = data.users.find((u) => u.email === SHOTS_EMAIL)?.id ?? null
        if (data.users.length < 200) break
      }
    }
    if (!userId) throw new Error('could not create or find the shots user')
    const { data: profile } = await db.from('profiles').select('id').eq('id', userId).maybeSingle()
    if (!profile) await db.from('profiles').insert({ id: userId, email: SHOTS_EMAIL })

    // Org (reuse the user's existing membership if the DB was not reset).
    const { data: member } = await db.from('org_members').select('org_id').eq('user_id', userId).limit(1).maybeSingle()
    let orgId = member?.org_id as string | undefined
    if (!orgId) {
      const { data: org, error } = await db.from('orgs').insert({ name: 'Demo Court HOA', hub_type: 'hoa' }).select('id').single()
      if (error || !org) throw new Error(`orgs insert: ${error?.code}`)
      orgId = org.id as string
      const { data: assoc, error: aErr } = await db
        .from('associations')
        .insert({ organization_id: orgId, name: 'Demo Court HOA', state: 'FL', slug: `DEMO${orgId.slice(0, 6).toUpperCase()}` })
        .select('id')
        .single()
      if (aErr || !assoc) throw new Error(`associations insert: ${aErr?.code}`)
      const units = ['101 Demo Court', '103 Demo Court', '105 Demo Court', '7 Sample Way', '12 Sample Way', '2 Mock Lane'].map(
        (address_line1) => ({ organization_id: orgId!, association_id: assoc.id, address_line1 }),
      )
      await db.from('units').insert(units)
      const { error: mErr } = await db.from('org_members').insert({ org_id: orgId, user_id: userId, role: 'admin' })
      if (mErr) throw new Error(`org_members insert: ${mErr.code}`)
    }
    // Platform admin too, so /admin renders.
    await db.from('platform_admins' as never).upsert({ user_id: userId } as never)
    console.log(`seed: ok (org ${orgId.slice(0, 8)}…)`)
    return true
  } catch (e) {
    console.log(`seed: skipped — ${(e as Error).message}. App routes will be skipped; the gallery still runs.`)
    return false
  }
}

async function waitFor(url: string, timeoutMs: number) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    try {
      const r = await fetch(url, { redirect: 'manual' })
      if (r.status < 500) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`server at ${url} did not come up`)
}

function startServer(): ChildProcess {
  assertLoopback(LOCAL_SUPABASE_URL)
  const env = {
    ...process.env,
    PORT: String(PORT),
    NEXT_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE_URL,
    SUPABASE_URL: LOCAL_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL_ANON_KEY,
    SUPABASE_ANON_KEY: LOCAL_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: LOCAL_SERVICE_KEY,
    SUPABASE_SECRET_KEY: LOCAL_SERVICE_KEY,
    NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
    DEV_AUTOLOGIN: '1',
    DEV_AUTOLOGIN_EMAIL: SHOTS_EMAIL,
    AI_API_KEY: 'local',
    NEXT_TELEMETRY_DISABLED: '1',
  }
  const child = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(PORT)], {
    cwd: resolve(ROOT, 'apps/hoa'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  child.stdout?.on('data', () => {})
  child.stderr?.on('data', () => {})
  return child
}

async function main() {
  const args = process.argv.slice(2)
  const only = args.find((a) => a.startsWith('--only='))?.slice(7)
  const galleryOnly = args.includes('--gallery-only')
  mkdirSync(OUT, { recursive: true })

  const seeded = galleryOnly ? false : await seed()
  const external = process.env.UI_SHOTS_URL
  const base = external ?? `http://localhost:${PORT}`
  const server = external ? null : startServer()
  const stop = () => {
    if (server?.pid) {
      try {
        process.kill(-server.pid, 'SIGTERM')
      } catch {
        // already gone
      }
    }
  }
  process.on('SIGINT', () => {
    stop()
    process.exit(130)
  })

  let browser: Browser | null = null
  let written = 0
  let failed = 0
  try {
    await waitFor(`${base}/login`, 180_000)
    browser = await (process.env.UI_SHOTS_BROWSER === 'webkit' ? webkit : chromium).launch()
    const shots = SHOTS.filter((s) => (!only || s.name.includes(only)) && (!s.auth || seeded))
    for (const shot of shots) {
      for (const width of shot.widths ?? WIDTHS) {
        for (const theme of shot.themes ?? THEMES) {
          const ctx = await browser.newContext({
            viewport: { width, height: width < 768 ? 812 : 900 },
            deviceScaleFactor: width < 768 ? 2 : 1,
            colorScheme: theme,
            reducedMotion: 'reduce',
          })
          await ctx.addInitScript(
            ([t, rail]) => {
              try {
                localStorage.setItem('theme', t)
                localStorage.setItem('sidebar', rail ? 'collapsed' : 'expanded')
              } catch {
                // storage unavailable
              }
            },
            [theme, Boolean(shot.rail)] as const,
          )
          if (shot.resident) {
            await ctx.addCookies([{ name: 'hh_role_override', value: 'resident', url: base }])
          }
          const page = await ctx.newPage()
          const file = resolve(OUT, `${shot.name}--${width}-${theme}.png`)
          try {
            await page.goto(`${base}${shot.path}`, { waitUntil: 'networkidle', timeout: 120_000 })
            // Hide Next's dev-mode indicator; it is not part of the product.
            await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
            await page.waitForTimeout(shot.path.includes('overlay') ? 700 : 300)
            await page.screenshot({ path: file, fullPage: !shot.path.includes('overlay') })
            written++
            console.log(`shot: ${shot.name} ${width} ${theme}`)
          } catch (e) {
            failed++
            console.log(`shot FAILED: ${shot.name} ${width} ${theme} — ${(e as Error).message.split('\n')[0]}`)
          } finally {
            await ctx.close()
          }
        }
      }
    }
  } finally {
    await browser?.close()
    stop()
  }
  console.log(`ui:shots — ${written} written, ${failed} failed → ${OUT}`)
  if (failed > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
