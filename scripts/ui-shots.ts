/**
 * scripts/ui-shots.ts — `pnpm ui:shots`
 *
 * The visual check for agents (and anyone) without a human browser:
 * screenshots a fixed list of routes across the four apps (hoa, pm,
 * eviction, marketing) at 375px and 1440px, light and dark, into
 * `.ui-shots/` (gitignored). Spec:
 * docs/specs/2026-10-15-design-system-v2.md § "Visual verification".
 *
 * What it does:
 *   1. Seeds a throwaway admin + demo HOA / PM / eviction orgs into the
 *      LOCAL Supabase (loopback only — refuses anything else) so real
 *      pages render. Extra demo rows live in scripts/ui-shots-seed.ts.
 *   2. Starts `next dev` per app that a selected shot needs (hoa on
 *      UI_SHOTS_PORT [3100], pm +1, eviction +2, marketing +3), pointed at
 *      local Supabase. hoa runs with DEV_AUTOLOGIN for the shots user; pm and
 *      eviction reuse that session (cookies on localhost are shared across
 *      ports), so hoa is started whenever a pm/eviction auth shot runs.
 *   3. Visits each route in Chromium and writes
 *      .ui-shots/<name>--<width>-<theme>.png (full page).
 *
 * The component gallery (/ui-gallery, dev-only) needs no data or auth, so
 * it always works; app routes are skipped with a note if seeding fails.
 *
 * Flags / env:
 *   --only=<substr>        only shots whose name contains substr
 *                          (comma-separated list allowed)
 *   --gallery-only         skip app routes
 *   --overflow             `pnpm ui:overflow`: no screenshots — load every
 *                          selected route at 375 and 1440 (light) and FAIL
 *                          (exit 1) when the page scrolls horizontally
 *                          (document scrollWidth > clientWidth) or any box
 *                          visibly spills out of its card/tile. Prints the
 *                          offending elements (tag + class, never text).
 *   UI_SHOTS_PORT=3100     base port (pick another when several checkouts
 *                          run shots at once)
 *   UI_SHOTS_URL=http://localhost:3000   use an hoa server you already run
 *   UI_SHOTS_BROWSER=webkit               Safari engine (run
 *                                         `npx playwright install webkit` once)
 *
 * Logs ids and counts only — never names, emails or addresses.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { chromium, webkit, type Browser } from 'playwright'
import { seedExtras } from './ui-shots-seed'

const ROOT = resolve(__dirname, '..')
const OUT = resolve(ROOT, '.ui-shots')
const PORT = Number(process.env.UI_SHOTS_PORT ?? 3100)
const LOCAL_SUPABASE_URL = process.env.LOCAL_SUPABASE_URL ?? 'http://127.0.0.1:54321'
// The Supabase CLI's fixed demo keys — identical on every machine, not secrets
// (same values as tests/integration/setup/env.ts).
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const SHOTS_EMAIL = 'ui-shots-admin@example.test' // reserved TLD; never routes

type App = 'hoa' | 'pm' | 'eviction' | 'marketing'
const APP_PORT: Record<App, number> = { hoa: PORT, pm: PORT + 1, eviction: PORT + 2, marketing: PORT + 3 }

interface Shot {
  name: string
  /** Route. `:var` segments are filled from the seed's vars; the shot is
   *  skipped when a var is missing. */
  path: string
  app?: App
  /** Needs the seeded session. */
  auth?: boolean
  /** Render as a resident (admin role-override cookie). */
  resident?: boolean
  /** Desktop sidebar collapsed to the icon rail. */
  rail?: boolean
  /** Board copilot panel open. */
  copilot?: boolean
  /** Viewport-sized screenshot instead of full page (shows what is pinned
   *  to the viewport — fixed/sticky bars — at the scroll position). */
  viewport?: boolean
  /** Scroll to the bottom before a viewport shot. */
  scrollBottom?: boolean
  widths?: number[]
  themes?: ('light' | 'dark')[]
  /** Render with print media (CSS `print:` styles), e.g. the resident statement. */
  print?: boolean
}

const WIDTHS = [375, 1440]
const THEMES: ('light' | 'dark')[] = ['light', 'dark']
const LIGHT: ('light' | 'dark')[] = ['light']

const SHOTS: Shot[] = [
  { name: 'gallery', path: '/ui-gallery' },
  { name: 'gallery-rail', path: '/ui-gallery', rail: true, widths: [1440] },
  { name: 'dashboard-rail', path: '/', auth: true, rail: true, widths: [1440], themes: LIGHT },
  { name: 'gallery-dialog', path: '/ui-gallery?overlay=dialog', themes: LIGHT },
  { name: 'gallery-sheet', path: '/ui-gallery?overlay=sheet', themes: LIGHT },
  { name: 'gallery-confirm', path: '/ui-gallery?overlay=confirm', themes: ['dark'] },
  { name: 'gallery-palette', path: '/ui-gallery?overlay=palette' },
  { name: 'gallery-menu', path: '/ui-gallery?overlay=menu', widths: [1440], themes: LIGHT },
  { name: 'gallery-toast', path: '/ui-gallery?overlay=toast', themes: LIGHT },
  { name: 'dashboard', path: '/', auth: true },
  { name: 'dashboard-copilot', path: '/', auth: true, copilot: true },
  // Top bar with the Copilot column open, across laptop widths: the bar's
  // available width is what drives its icon-only / labelled states.
  { name: 'topbar-copilot', path: '/', auth: true, copilot: true, viewport: true, widths: [1024, 1280, 1440], themes: LIGHT },
  { name: 'topbar', path: '/', auth: true, viewport: true, widths: [768, 1024, 1440], themes: LIGHT },
  { name: 'dashboard-viewport', path: '/', auth: true, viewport: true, scrollBottom: true, widths: [1440], themes: LIGHT },
  { name: 'approvals', path: '/approvals', auth: true },
  // BL-021: the scanned-bill cards, and the upload screen.
  { name: 'approvals-bills', path: '/approvals?type=bill', auth: true },
  { name: 'accounting-invoices-new', path: '/accounting/invoices/new', auth: true },
  { name: 'violations', path: '/violations', auth: true },
  // BL-019: the state-law rule panel where the board creates and reviews
  // violation letter drafts.
  { name: 'violations-new', path: '/violations/new', auth: true },
  { name: 'violations-approval-queue', path: '/violations/approval-queue', auth: true },
  { name: 'dues', path: '/dues', auth: true },
  { name: 'inbox', path: '/inbox', auth: true },
  { name: 'properties', path: '/properties', auth: true },
  { name: 'meetings', path: '/meetings', auth: true },
  { name: 'meeting-detail', path: '/meetings/:meetingId', auth: true, themes: LIGHT },
  // BL-016 board packet: screen at both widths and themes, plus paper
  // (print media at US Letter width) in both themes — dark must print light.
  { name: 'meeting-packet', path: '/meetings/:meetingId/packet', auth: true },
  { name: 'meeting-packet-print', path: '/meetings/:meetingId/packet', auth: true, print: true, widths: [816] },
  { name: 'tickets', path: '/tickets', auth: true },
  { name: 'communications', path: '/communications', auth: true },
  { name: 'accounting', path: '/accounting', auth: true },
  { name: 'vendors', path: '/vendors', auth: true },
  { name: 'settings-members', path: '/settings/members', auth: true },
  { name: 'settings-payments', path: '/settings/payments', auth: true },
  { name: 'settings-data', path: '/settings/data', auth: true },
  { name: 'settings-reminders', path: '/settings/reminders', auth: true },
  { name: 'legal-compliance', path: '/legal/compliance', auth: true },

  // Platform admin
  { name: 'admin', path: '/admin', auth: true },
  { name: 'admin-tenants', path: '/admin/tenants', auth: true },
  { name: 'admin-tenant', path: '/admin/tenants/:hoaOrgId', auth: true },
  { name: 'admin-tenant-edit', path: '/admin/tenants/:hoaOrgId/edit', auth: true, themes: LIGHT },
  { name: 'admin-tenant-preview', path: '/admin/tenants/:hoaOrgId/preview', auth: true, themes: LIGHT },
  { name: 'admin-tenant-new', path: '/admin/tenants/new', auth: true, themes: LIGHT },
  { name: 'admin-admins', path: '/admin/admins', auth: true },
  { name: 'admin-analytics', path: '/admin/analytics', auth: true },
  { name: 'admin-audit', path: '/admin/audit', auth: true },
  { name: 'admin-import', path: '/admin/import-units', auth: true, themes: LIGHT },

  // Resident portal
  { name: 'resident', path: '/resident', auth: true, resident: true },
  { name: 'resident-viewport', path: '/resident', auth: true, resident: true, viewport: true, scrollBottom: true, widths: [375], themes: LIGHT },
  { name: 'resident-dues', path: '/resident/dues', auth: true, resident: true },
  { name: 'resident-pay', path: '/resident/dues/pay', auth: true, resident: true },
  { name: 'resident-ledger', path: '/resident/dues/ledger', auth: true, resident: true },
  { name: 'resident-statement', path: '/resident/dues/statement', auth: true, resident: true },
  { name: 'resident-statement-print', path: '/resident/dues/statement', auth: true, resident: true, print: true, widths: [816], themes: LIGHT },
  { name: 'resident-requests', path: '/resident/requests', auth: true, resident: true },
  { name: 'resident-tickets', path: '/resident/tickets', auth: true, resident: true },
  { name: 'resident-ticket', path: '/resident/tickets/:residentTicketId', auth: true, resident: true },
  { name: 'resident-ticket-new', path: '/resident/tickets/new', auth: true, resident: true },
  { name: 'resident-arc', path: '/resident/arc', auth: true, resident: true },
  { name: 'resident-arc-detail', path: '/resident/arc/:residentArcId', auth: true, resident: true },
  { name: 'resident-arc-new', path: '/resident/arc/new', auth: true, resident: true },
  { name: 'resident-violations', path: '/resident/violations', auth: true, resident: true },
  { name: 'resident-violation', path: '/resident/violations/:residentReportId', auth: true, resident: true },
  { name: 'resident-report', path: '/resident/report-violation', auth: true, resident: true },
  { name: 'resident-ask', path: '/resident/ask', auth: true, resident: true },
  { name: 'resident-documents', path: '/resident/documents', auth: true, resident: true },
  { name: 'resident-account', path: '/resident/account', auth: true, resident: true },
  { name: 'resident-announcements', path: '/resident/announcements', auth: true, resident: true },

  // PM Hub
  { name: 'pm-home', app: 'pm', path: '/', auth: true },
  { name: 'pm-rent', app: 'pm', path: '/rent', auth: true },
  { name: 'pm-setup', app: 'pm', path: '/setup', auth: true },
  { name: 'pm-settings', app: 'pm', path: '/settings', auth: true },
  { name: 'pm-billing', app: 'pm', path: '/settings/billing', auth: true },
  { name: 'pm-404', app: 'pm', path: '/no-such-page', auth: true, themes: LIGHT },
  { name: 'pm-login', app: 'pm', path: '/login' },
  { name: 'pm-signup', app: 'pm', path: '/signup', themes: LIGHT },
  { name: 'pm-verify', app: 'pm', path: '/verify', themes: LIGHT },

  // Eviction Hub
  { name: 'eviction-home', app: 'eviction', path: '/', auth: true },
  { name: 'eviction-case', app: 'eviction', path: '/cases/:evictionCaseId', auth: true },
  { name: 'eviction-case-new', app: 'eviction', path: '/cases/new', auth: true },
  { name: 'eviction-settings', app: 'eviction', path: '/settings', auth: true },
  { name: 'eviction-billing', app: 'eviction', path: '/settings/billing', auth: true },
  { name: 'eviction-404', app: 'eviction', path: '/no-such-page', auth: true, themes: LIGHT },
  { name: 'eviction-login', app: 'eviction', path: '/login' },
  { name: 'eviction-signup', app: 'eviction', path: '/signup', themes: LIGHT },
  { name: 'eviction-verify', app: 'eviction', path: '/verify', themes: LIGHT },

  // Marketing (light-only brochure)
  ...[
    '/',
    '/about',
    '/blog',
    '/case-studies',
    '/case-studies/madison-park',
    '/compare',
    '/demo',
    '/docs',
    '/dpa',
    '/eviction',
    '/hoa',
    '/honesty-bars',
    '/landlords',
    '/pricing',
    '/privacy',
    '/roadmap',
    '/security',
    '/status',
    '/terms',
  ].map(
    (path): Shot => ({
      name: `mkt-${path === '/' ? 'home' : path.slice(1).replace(/\//g, '-')}`,
      app: 'marketing',
      path,
      themes: LIGHT,
    }),
  ),
]

function assertLoopback(url: string) {
  const host = new URL(url).hostname
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
    throw new Error(`ui-shots: refusing non-loopback Supabase host ${JSON.stringify(host)}`)
  }
}

/** Idempotent: find-or-create an org of `hub` that the user belongs to. */
async function ensureOrg(
  db: SupabaseClient,
  userId: string,
  hub: 'hoa' | 'pm' | 'eviction',
  name: string,
): Promise<{ id: string; created: boolean }> {
  const { data: rows } = await db
    .from('org_members')
    .select('org_id, orgs!inner(hub_type)')
    .eq('user_id', userId)
    .eq('orgs.hub_type', hub)
    .limit(1)
  const existing = (rows?.[0] as { org_id?: string } | undefined)?.org_id
  if (existing) return { id: existing, created: false }
  const { data: org, error } = await db.from('orgs').insert({ name, hub_type: hub }).select('id').single()
  if (error || !org) throw new Error(`orgs insert (${hub}): ${error?.code}`)
  const { error: mErr } = await db.from('org_members').insert({ org_id: org.id, user_id: userId, role: 'admin' })
  if (mErr) throw new Error(`org_members insert (${hub}): ${mErr.code}`)
  return { id: org.id as string, created: true }
}

interface SeedResult {
  vars: Record<string, string>
}

/** Idempotent: a board-admin user in small demo orgs on the LOCAL stack. */
async function seed(): Promise<SeedResult | null> {
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

    // HOA org (+ association and a few units on first creation).
    const hoa = await ensureOrg(db, userId, 'hoa', 'Demo Court HOA')
    if (hoa.created) {
      const { data: assoc, error: aErr } = await db
        .from('associations')
        .insert({ organization_id: hoa.id, name: 'Demo Court HOA', state: 'FL', slug: `DEMO${hoa.id.slice(0, 6).toUpperCase()}` })
        .select('id')
        .single()
      if (aErr || !assoc) throw new Error(`associations insert: ${aErr?.code}`)
      const units = ['101 Demo Court', '103 Demo Court', '105 Demo Court', '7 Sample Way', '12 Sample Way', '2 Mock Lane'].map(
        (address_line1) => ({ organization_id: hoa.id, association_id: assoc.id, address_line1 }),
      )
      await db.from('units').insert(units)
    }
    const pm = await ensureOrg(db, userId, 'pm', 'Demo Rentals LLC')
    const eviction = await ensureOrg(db, userId, 'eviction', 'Demo Rentals LLC')

    // Platform admin too, so /admin renders.
    await db.from('platform_admins' as never).upsert({ user_id: userId } as never)

    const vars: Record<string, string> = { hoaOrgId: hoa.id, pmOrgId: pm.id, evictionOrgId: eviction.id }
    try {
      Object.assign(vars, await seedExtras(db, { userId, hoaOrgId: hoa.id, pmOrgId: pm.id, evictionOrgId: eviction.id }))
    } catch (e) {
      console.log(`seed extras: partial — ${(e as Error).message}`)
    }
    console.log(`seed: ok (hoa ${hoa.id.slice(0, 8)}…, pm ${pm.id.slice(0, 8)}…, eviction ${eviction.id.slice(0, 8)}…, ${Object.keys(vars).length} vars)`)
    return { vars }
  } catch (e) {
    console.log(`seed: skipped — ${(e as Error).message}. App routes will be skipped; the gallery still runs.`)
    return null
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

function startServer(app: App): ChildProcess {
  assertLoopback(LOCAL_SUPABASE_URL)
  const port = APP_PORT[app]
  const env = {
    ...process.env,
    PORT: String(port),
    NEXT_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE_URL,
    SUPABASE_URL: LOCAL_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL_ANON_KEY,
    SUPABASE_ANON_KEY: LOCAL_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: LOCAL_SERVICE_KEY,
    SUPABASE_SECRET_KEY: LOCAL_SERVICE_KEY,
    NEXT_PUBLIC_APP_URL: `http://localhost:${port}`,
    NEXT_PUBLIC_HOA_URL: `http://localhost:${APP_PORT.hoa}`,
    NEXT_PUBLIC_PM_URL: `http://localhost:${APP_PORT.pm}`,
    NEXT_PUBLIC_EVICTION_URL: `http://localhost:${APP_PORT.eviction}`,
    DEV_AUTOLOGIN: app === 'hoa' ? '1' : '',
    DEV_AUTOLOGIN_EMAIL: SHOTS_EMAIL,
    AI_API_KEY: 'local',
    NEXT_TELEMETRY_DISABLED: '1',
  }
  const child = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(port)], {
    cwd: resolve(ROOT, 'apps', app),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  child.stdout?.on('data', () => {})
  child.stderr?.on('data', () => {})
  return child
}

interface OverflowReport {
  scrollWidth: number
  clientWidth: number
  /** Elements that stick out past the viewport edge. */
  offscreen: string[]
  /** Boxes whose content visibly spills out of a card/tile. */
  spills: string[]
}

/**
 * Runs in the page. Three checks:
 *  1. page-level: the document must not scroll sideways, and no element may
 *     extend past the viewport edge (unless an ancestor clips/scrolls it —
 *     a TableScroll is allowed to be wider than the screen);
 *  2. card-level: inside any bordered box (`.rounded-xl.border` — the kit's
 *     Card — or `.rounded-lg.border` — Alert, callouts) no descendant or its
 *     text may poke out of the box. That is
 *     the "KPI delta spills out of its tile" bug, which never widens the
 *     document at 1440 and so check 1 alone would miss it;
 *  3. bar-level: no <header> may overflow its own box (a crowded top bar
 *     whose items would overlap or be cut off).
 * Describes elements by tag + a few classes only — never their text (PII).
 */
function probeOverflow(): OverflowReport {
  const doc = document.documentElement
  const vw = doc.clientWidth
  const describe = (el: Element) => {
    const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 6).join('.')
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`
  }
  const clipsX = (el: Element) => {
    const o = getComputedStyle(el).overflowX
    return o === 'hidden' || o === 'auto' || o === 'scroll' || o === 'clip'
  }
  const clippedBetween = (el: Element, stop: Element | null) => {
    for (let p = el.parentElement; p && p !== stop; p = p.parentElement) if (clipsX(p)) return true
    return false
  }
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return null
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.position === 'fixed') return null
    if (el.closest('[aria-hidden="true"], .sr-only, nextjs-portal, [data-radix-popper-content-wrapper]')) return null
    return r
  }
  const offscreen: string[] = []
  const spills: string[] = []
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    const r = visible(el)
    if (!r) continue
    // Entirely outside the viewport = an off-canvas drawer at rest; only a
    // box STRADDLING the edge is a layout bug.
    const straddles = (r.right > vw + 1 && r.left < vw) || (r.left < -1 && r.right > 0)
    if (straddles && !clippedBetween(el, null)) offscreen.push(describe(el))
  }
  // Bordered boxes: the kit's Card (`rounded-xl border`) and the smaller
  // bordered panels inside cards (Alert, callouts: `rounded-lg border`).
  for (const card of Array.from(document.querySelectorAll('.rounded-xl.border, .rounded-lg.border'))) {
    const cr = card.getBoundingClientRect()
    if (cr.width === 0) continue
    for (const el of Array.from(card.querySelectorAll('*'))) {
      const r = visible(el)
      if (!r) continue
      if (clippedBetween(el, card)) continue
      // The box itself pokes out of the card…
      if (r.right > cr.right + 1 || r.left < cr.left - 1) spills.push(describe(el))
      // …or its content (e.g. a nowrap figure) overflows a box that does
      // not clip it, far enough to reach the card's edge.
      else if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && !clipsX(el)) {
        const contentRight = r.left + el.clientLeft + el.scrollWidth
        // Text must stay ≥4px clear of the card's border: hover rows may
        // bleed into the padding, text touching the border is a spill.
        if (contentRight > cr.right - 4) {
          spills.push(`${describe(el)} (content ${el.scrollWidth}px in a ${el.clientWidth}px box, reaches within 4px of the card edge)`)
        }
      }
    }
  }
  // 3. bars: a top bar whose items do not fit overflows its own box (items
  //    would overlap or be cut off) — scrollWidth exceeds clientWidth.
  for (const bar of Array.from(document.querySelectorAll('header'))) {
    if (bar.getBoundingClientRect().width > 0 && bar.scrollWidth > bar.clientWidth + 1) {
      spills.push(`${describe(bar)} (bar content ${bar.scrollWidth}px > ${bar.clientWidth}px)`)
    }
  }
  const uniq = (a: string[]) => [...new Set(a)].slice(0, 8)
  return { scrollWidth: doc.scrollWidth, clientWidth: vw, offscreen: uniq(offscreen), spills: uniq(spills) }
}

function fillPath(path: string, vars: Record<string, string>): string | null {
  let missing = false
  const out = path.replace(/:([A-Za-z]\w*)/g, (_, k: string) => {
    const v = vars[k]
    if (!v) missing = true
    return v ?? ''
  })
  return missing ? null : out
}

async function main() {
  const args = process.argv.slice(2)
  const onlyArg = args.find((a) => a.startsWith('--only='))?.slice(7)
  const only = onlyArg ? onlyArg.split(',').filter(Boolean) : null
  const galleryOnly = args.includes('--gallery-only')
  const overflowMode = args.includes('--overflow')
  mkdirSync(OUT, { recursive: true })

  // `--serve=hoa,pm` just runs those dev servers (seeded, same env) until
  // killed — so several shot runs can share one server via UI_SHOTS_URL
  // instead of fighting over the app's .next directory.
  const serve = args.find((a) => a.startsWith('--serve='))?.slice(8)
  if (serve) {
    await seed()
    const list = serve.split(',') as App[]
    const children = list.map((a) => startServer(a))
    for (const a of list) console.log(`serving ${a} on http://localhost:${APP_PORT[a]}`)
    const kill = () => {
      for (const c of children) if (c.pid) try { process.kill(-c.pid, 'SIGTERM') } catch { /* gone */ }
      process.exit(0)
    }
    process.on('SIGINT', kill)
    process.on('SIGTERM', kill)
    await new Promise(() => {})
  }

  const selected = SHOTS.filter(
    (s) => (!only || only.some((o) => s.name.includes(o))) && (!galleryOnly || s.name.startsWith('gallery')),
  )
  const needsSeed = selected.some((s) => s.auth)
  const seeded = needsSeed ? await seed() : null
  const shots = selected.filter((s) => !s.auth || seeded)

  const external = process.env.UI_SHOTS_URL
  const bases: Record<App, string> = {
    hoa: external ?? `http://localhost:${APP_PORT.hoa}`,
    pm: `http://localhost:${APP_PORT.pm}`,
    eviction: `http://localhost:${APP_PORT.eviction}`,
    marketing: `http://localhost:${APP_PORT.marketing}`,
  }
  const apps = new Set<App>()
  for (const s of shots) {
    const app = s.app ?? 'hoa'
    apps.add(app)
    if (s.auth && app !== 'hoa') apps.add('hoa') // pm/eviction sign in through hoa's dev-login
  }
  if (external) apps.delete('hoa')
  const servers = [...apps].map((a) => ({ app: a, child: startServer(a) }))
  const stop = () => {
    for (const { child } of servers) {
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGTERM')
        } catch {
          // already gone
        }
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
  let skipped = 0
  const overflowFailures: string[] = []
  try {
    await Promise.all(
      [...apps, ...(external ? (['hoa'] as App[]) : [])].map((a) =>
        waitFor(`${bases[a]}${a === 'marketing' ? '/' : '/login'}`, 240_000),
      ),
    )
    browser = await (process.env.UI_SHOTS_BROWSER === 'webkit' ? webkit : chromium).launch()
    for (const shot of shots) {
      // Paper layout is not a screen layout; the screen shot of the same route covers overflow.
      if (overflowMode && shot.print) continue
      const app = shot.app ?? 'hoa'
      const path = fillPath(shot.path, seeded?.vars ?? {})
      if (!path) {
        skipped++
        console.log(`shot skipped: ${shot.name} (no seed data for ${shot.path})`)
        continue
      }
      // Overflow mode: layout is theme-independent, so light only, and
      // always both reference widths regardless of the shot's own list.
      for (const width of overflowMode ? WIDTHS : (shot.widths ?? WIDTHS)) {
        for (const theme of overflowMode ? LIGHT : (shot.themes ?? THEMES)) {
          const ctx = await browser.newContext({
            viewport: { width, height: width < 768 ? 812 : 900 },
            deviceScaleFactor: width < 768 ? 2 : 1,
            colorScheme: theme,
            reducedMotion: 'reduce',
          })
          await ctx.addInitScript(
            ([t, rail, copilot]) => {
              try {
                localStorage.setItem('theme', t)
                localStorage.setItem('sidebar', rail ? 'collapsed' : 'expanded')
                localStorage.setItem('hoa.copilot.open', copilot ? '1' : '0')
              } catch {
                // storage unavailable
              }
            },
            [theme, Boolean(shot.rail), Boolean(shot.copilot)] as const,
          )
          // tsx/esbuild wraps named functions in `__name(...)`; define it in
          // the page so evaluate(probeOverflow) runs there.
          await ctx.addInitScript('window.__name = window.__name || ((f) => f)')
          if (shot.resident) {
            await ctx.addCookies([{ name: 'hh_role_override', value: 'resident', url: bases.hoa }])
          }
          const page = await ctx.newPage()
          const file = resolve(OUT, `${shot.name}--${width}-${theme}.png`)
          try {
            if (shot.auth && app !== 'hoa') {
              // Mint a session through hoa's dev-only auto-login; the sb-*
              // cookies are host-scoped (localhost), so pm/eviction see them.
              await page.goto(`${bases.hoa}/auth/dev-login?redirect=/api/health`, { waitUntil: 'load', timeout: 120_000 })
            }
            if (shot.print) await page.emulateMedia({ media: 'print' })
            await page.goto(`${bases[app]}${path}`, { waitUntil: 'networkidle', timeout: 120_000 })
            // Hide Next's dev-mode indicator; it is not part of the product.
            await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
            if (shot.scrollBottom) {
              await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
            }
            await page.waitForTimeout(shot.path.includes('overlay') || shot.copilot ? 700 : 300)
            if (overflowMode) {
              const r = await page.evaluate(probeOverflow)
              const bad = r.scrollWidth > r.clientWidth || r.offscreen.length > 0 || r.spills.length > 0
              if (bad) {
                overflowFailures.push(`${shot.name} @${width}`)
                console.log(
                  `OVERFLOW: ${shot.name} ${width} — scrollWidth ${r.scrollWidth} vs clientWidth ${r.clientWidth}` +
                    (r.offscreen.length ? `\n    off-screen: ${r.offscreen.join('\n                ')}` : '') +
                    (r.spills.length ? `\n    spills out of card: ${r.spills.join('\n                        ')}` : ''),
                )
              } else {
                console.log(`ok: ${shot.name} ${width} (scrollWidth ${r.scrollWidth} = clientWidth ${r.clientWidth})`)
              }
              written++
              continue
            }
            const fullPage = !shot.path.includes('overlay') && !shot.viewport
            if (fullPage) {
              // Grow the viewport to the document height first. Chromium's
              // fullPage capture otherwise paints sticky/fixed chrome (tab
              // bars, sticky sidebars) at their first-viewport position,
              // mid-page — which is not what any user ever sees.
              const h = await page.evaluate(() => document.documentElement.scrollHeight)
              const vh = width < 768 ? 812 : 900
              if (h > vh) {
                await page.setViewportSize({ width, height: Math.min(h, 12_000) })
                await page.waitForTimeout(250)
              }
            }
            await page.screenshot({ path: file, fullPage })
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
  if (overflowMode) {
    console.log(
      `ui:overflow — ${written} checked, ${overflowFailures.length} overflowing, ${failed} failed to load, ${skipped} skipped` +
        (overflowFailures.length ? `\n  overflowing: ${overflowFailures.join(', ')}` : ''),
    )
    if (overflowFailures.length > 0 || failed > 0) process.exitCode = 1
    return
  }
  console.log(`ui:shots — ${written} written, ${failed} failed, ${skipped} skipped → ${OUT}`)
  if (failed > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
