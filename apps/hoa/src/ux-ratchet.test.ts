import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * UX ratchet — docs/specs/2026-10-15-enterprise-ux-plan.md, decision 4.
 *
 * `pnpm lint` has never worked in this repo (CLAUDE.md §4), so the UX
 * rules from the enterprise audit are enforced here instead, by scanning
 * page source as text. Each rule holds an allowlist of pages that break it
 * today. The allowlists can only SHRINK:
 *
 *   - a page not on the list that breaks the rule fails the test (no new
 *     offenders), and
 *   - a page on the list that no longer breaks the rule ALSO fails, with a
 *     message telling you to delete it from the list — so a fix is locked
 *     in and cannot quietly regress later.
 *
 * Text scanning is crude by design. It sees `const { data } = await …`, not
 * data flow; a helper in lib/ that swallows errors is invisible to it. A
 * green ratchet proves only the patterns below are absent, nothing more.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const APP_DIRS = ['apps/hoa/src/app', 'apps/pm/src/app', 'apps/eviction/src/app']

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (name === 'page.tsx') out.push(full)
  }
  return out
}

/** Repo-relative path → source, for every page.tsx in the three apps. */
const pages = new Map<string, string>(
  APP_DIRS.flatMap((d) => walk(path.join(repoRoot, d))).map((f) => [
    path.relative(repoRoot, f).split(path.sep).join('/'),
    readFileSync(f, 'utf8'),
  ]),
)

const hoa = (route: string) => `apps/hoa/src/app/${route}/page.tsx`.replace('/./', '/')

/**
 * Check a rule against its allowlist in both directions. Returns messages
 * rather than asserting per page so one run reports every problem.
 */
function ratchet(
  offends: (src: string) => boolean,
  allowlist: readonly string[],
): { newOffenders: string[]; fixedButListed: string[]; missing: string[] } {
  const allowed = new Set(allowlist)
  const newOffenders: string[] = []
  const fixedButListed: string[] = []
  for (const [file, src] of pages) {
    const bad = offends(src)
    if (bad && !allowed.has(file)) newOffenders.push(file)
    if (!bad && allowed.has(file)) fixedButListed.push(file)
  }
  const missing = allowlist.filter((f) => !pages.has(f))
  return { newOffenders, fixedButListed, missing }
}

function expectRatchet(result: ReturnType<typeof ratchet>, rule: string): void {
  expect(
    result.newOffenders,
    `${rule}: these pages break the rule and are not allowlisted. Fix them — do not add them to the list.`,
  ).toEqual([])
  expect(
    result.fixedButListed,
    `${rule}: these pages are fixed. Delete them from the allowlist so the fix cannot regress.`,
  ).toEqual([])
  expect(result.missing, `${rule}: allowlisted pages that no longer exist — delete them.`).toEqual([])
}

it('finds the pages it is meant to scan', () => {
  // Guards against the scan silently matching nothing (a moved directory
  // would otherwise turn every rule below into a vacuous pass).
  expect(pages.size).toBeGreaterThan(130)
  expect(pages.has(hoa('(dashboard)/violations'))).toBe(true)
  expect(pages.has('apps/pm/src/app/(dashboard)/page.tsx')).toBe(true)
})

// ── Rule 1: the phase-1 pages keep their migration ────────────────────────

/** Board pages migrated to <Page> in phase 1. */
const PAGE_CONTAINER_ROUTES = [
  '(dashboard)',
  '(dashboard)/violations',
  '(dashboard)/dues',
  '(dashboard)/tickets',
  '(dashboard)/communications',
  '(dashboard)/meetings',
  // Community operations area pass (design system v2): every non-split-pane
  // page under inbox, properties, leases, violations, ARC, meetings, events,
  // communications and tickets.
  '(dashboard)/arc',
  '(dashboard)/arc/[id]',
  '(dashboard)/communications/[id]',
  '(dashboard)/communications/new',
  '(dashboard)/events',
  '(dashboard)/events/[id]',
  '(dashboard)/events/new',
  '(dashboard)/inbox/compose',
  '(dashboard)/leases',
  '(dashboard)/meetings/[id]',
  '(dashboard)/meetings/[id]/edit',
  '(dashboard)/meetings/[id]/packet',
  '(dashboard)/meetings/new',
  '(dashboard)/meetings/schedule',
  '(dashboard)/properties/[id]/edit',
  '(dashboard)/properties/new',
  '(dashboard)/tickets/[id]',
  '(dashboard)/violations/[id]',
  '(dashboard)/violations/[id]/edit',
  '(dashboard)/violations/approval-queue',
  '(dashboard)/violations/new',
  '(dashboard)/violations/reports',
  '(dashboard)/violations/reports/[id]',
  // Design-system v2 area pass (dashboard, vendors, knowledge, settings).
  '(dashboard)/vendors',
  '(dashboard)/vendors/[id]',
  '(dashboard)/rfps',
  '(dashboard)/rfps/[id]',
  '(dashboard)/documents',
  '(dashboard)/documents/[id]',
  '(dashboard)/documents/governing',
  '(dashboard)/legal',
  '(dashboard)/legal/updates',
  '(dashboard)/legal/compliance',
  '(dashboard)/ai/ask',
  '(dashboard)/settings',
  '(dashboard)/settings/members',
  '(dashboard)/settings/mailbox',
  // BL-014 approvals inbox.
  '(dashboard)/approvals',
]

/**
 * Phase-1 pages that are NOT wrapped in <Page>, with the reason. Inbox and
 * properties are full-height split panes; a fixed-width container breaks
 * them. Resident pages keep their own ScreenHeader kit (plan decision 2).
 * They must still use the shared Pager.
 */
const PAGER_ONLY_ROUTES = ['(dashboard)/inbox', '(dashboard)/properties/PropertyListPager']

/** Phase-1 resident pages: must render LoadFailed for their failed reads. */
const RESIDENT_ROUTES = [
  'resident',
  'resident/dues',
  'resident/requests',
  'resident/announcements',
]

describe('phase-1 pages stay migrated', () => {
  it.each(PAGE_CONTAINER_ROUTES)('%s renders inside <Page>', (route) => {
    const src = pages.get(hoa(route))
    expect(src, `missing ${hoa(route)}`).toBeDefined()
    expect(src).toMatch(/import\s*\{[^}]*\bPage\b[^}]*\}\s*from '@homeowner-portal\/ui'/)
    expect(src).toMatch(/<Page\b/)
  })

  it.each(PAGER_ONLY_ROUTES)('%s uses the shared Pager', (route) => {
    const file = route.endsWith('Pager')
      ? `apps/hoa/src/app/${route}.tsx`
      : hoa(route)
    const src = readFileSync(path.join(repoRoot, file), 'utf8')
    expect(src).toMatch(/<Pager\b/)
  })

  it.each(RESIDENT_ROUTES)('%s handles a failed read with LoadFailed', (route) => {
    const src = pages.get(hoa(route))
    expect(src).toMatch(/<LoadFailed\b/)
    // Residents keep the mobile kit, not the board <Page> container.
    expect(src).not.toMatch(/<Page\b/)
  })

  it('every <Page> width is one of the three fixed values', () => {
    for (const [file, src] of pages) {
      for (const m of src.matchAll(/<Page\b[^>]*\bwidth="([^"]*)"/g)) {
        expect(['narrow', 'default', 'wide'], file).toContain(m[1])
      }
    }
  })
})

// ── Rule 2: a Supabase read must not discard its error ────────────────────

/**
 * Pages that read Supabase and drop `error` today: `const { data } = await
 * …` with no `error` in the same destructuring, or `(await …).data`.
 * Auth calls (`auth.getUser()`) are not counted — a missing user redirects.
 * Shrink-only. Use `loadOrFail` (apps/hoa/src/lib/load-or-fail.ts).
 */
const DISCARDS_ERROR_ALLOWLIST: string[] = []

/** Exported for the self-test below. */
export function discardsQueryError(src: string): boolean {
  // `const { data } = await x` / `const { data: rows, count } = await x`,
  // possibly spanning lines. The braces may nest one level
  // (`{ data: { user } }`), hence the two-level pattern.
  const destructure = /const\s*\{((?:[^{}]|\{[^{}]*\})*)\}\s*=\s*await\s+([^\n;]*)/g
  for (const m of src.matchAll(destructure)) {
    const fields = m[1]
    const callee = m[2]
    if (!/\bdata\b/.test(fields)) continue
    if (/\berror\b/.test(fields)) continue
    if (/\bauth\./.test(callee)) continue
    return true
  }
  // `(await supabase.from(...)...).data` — reaching straight past the error.
  return /\(\s*await\s[^;]{0,600}?\)\s*\)?\.data\b/.test(src)
}

describe('Supabase reads handle their error', () => {
  it('detector self-test', () => {
    expect(discardsQueryError('const { data } = await supabase.from("x").select()')).toBe(true)
    expect(discardsQueryError('const { data: rows, count } = await q')).toBe(true)
    expect(discardsQueryError('const { data, error } = await q')).toBe(false)
    expect(
      discardsQueryError('const {\n    data: { user },\n  } = await supabase.auth.getUser()'),
    ).toBe(false)
    expect(discardsQueryError('const res = await loadOrFail("x", q)')).toBe(false)
    expect(discardsQueryError('const rows = ((await supabase.from("t").select()).data ?? [])')).toBe(true)
  })

  it('no page outside the allowlist discards a query error (shrink-only)', () => {
    expectRatchet(ratchet(discardsQueryError, DISCARDS_ERROR_ALLOWLIST), 'discards-query-error')
  })
})

// ── Rule 3: no silent truncation ───────────────────────────────────────────

/**
 * Pages with a `.limit(` and no `Pager`. A hard cap drops rows with no
 * notice. Shrink-only: page with `Pager`, or justify the cap in the page.
 */
const LIMIT_WITHOUT_PAGER_ALLOWLIST = [
  'apps/pm/src/app/(dashboard)/page.tsx',
  'apps/pm/src/app/(dashboard)/rent/page.tsx',
  'apps/pm/src/app/(dashboard)/setup/page.tsx',
]

const limitWithoutPager = (src: string): boolean => /\.limit\(/.test(src) && !/<Pager\b/.test(src)

describe('lists do not silently truncate', () => {
  it('no page outside the allowlist has .limit( without a Pager (shrink-only)', () => {
    expectRatchet(ratchet(limitWithoutPager, LIMIT_WITHOUT_PAGER_ALLOWLIST), 'limit-without-pager')
  })
})

// ── Rule 4: no blank page when the org is missing ─────────────────────────

describe('no-org state', () => {
  it('no page returns null for a missing org (render <NoOrgSelected /> instead)', () => {
    const offenders = [...pages]
      .filter(([, src]) => /if\s*\(\s*!\s*org\s*\)\s*return\s+null\b/.test(src))
      .map(([file]) => file)
    expect(offenders).toEqual([])
  })
})

// ── Rule 5: raw error text never reaches the user ─────────────────────────

describe('raw error text', () => {
  it('no page renders an error message into JSX', () => {
    // `{error.message}</…` as an element's child (dues and documents both
    // did this). A console.error template literal does not match. Only the
    // direct form is detectable; a message copied into a variable first is
    // not. LoadFailed takes no error prop at all, so there is never a
    // reason to.
    const offenders = [...pages]
      .filter(([, src]) => /\{\s*(?:\w+\.)?error\.message\s*\}\s*<\//.test(src))
      .map(([file]) => file)
    expect(offenders).toEqual([])
  })
})

// ── Rule 6: no native confirm dialogs ─────────────────────────────────────

/** Every .ts/.tsx under the three apps' src, not just pages. */
function walkSource(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name !== 'node_modules') out.push(...walkSource(full))
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

describe('confirmation dialogs', () => {
  it('no window.confirm — use useConfirm() / <ConfirmDialog> (design-system v2)', () => {
    // Safari renders window.confirm as an unstyled system sheet (UX audit
    // finding 13). All three survivors were migrated; this keeps it at zero.
    const offenders = ['apps/hoa/src', 'apps/pm/src', 'apps/eviction/src']
      .flatMap((d) => walkSource(path.join(repoRoot, d)))
      .filter((f) => /\bwindow\.confirm\s*\(/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(repoRoot, f))
    expect(offenders).toEqual([])
  })
})

// ── Money area (design system v2 pass): every page stays on the kit ──────

describe('money pages stay on design system v2', () => {
  const money = [...pages.keys()].filter(
    (f) =>
      f.startsWith('apps/hoa/src/app/(dashboard)/accounting/') ||
      f.startsWith('apps/hoa/src/app/(dashboard)/dues/') ||
      f === 'apps/hoa/src/app/(dashboard)/settings/billing/page.tsx',
  )

  it('finds the money pages', () => {
    expect(money.length).toBeGreaterThanOrEqual(25)
  })

  it.each(money)('%s renders inside <Page> (or a shared wrapper that does)', (file) => {
    const src = pages.get(file)!
    expect(/<Page\b/.test(src) || /<Accounting(NotSetUp|LoadFailed)\b/.test(src)).toBe(true)
  })

  it.each(money)('%s has no hard-coded palette classes, dark: variants, raw <table> or font-mono', (file) => {
    const src = pages.get(file)!
    expect(src).not.toMatch(/\b(?:bg|text|border)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/)
    expect(src).not.toMatch(/\bdark:/)
    expect(src).not.toMatch(/<table\b/)
    expect(src).not.toMatch(/\bfont-mono\b/)
  })
})

// ── Rule 7: restyled areas stay on semantic tokens ────────────────────────

/**
 * Areas restyled to design-system v2 (docs/specs/2026-10-15-design-system-v2.md
 * §6 rule 2). Every .ts/.tsx under these paths must use semantic tokens only:
 * no hard-coded Tailwind palette classes (`bg-emerald-50`, `text-gray-500`),
 * no `bg-white`/`bg-black`, no `dark:` variants (the tokens already theme),
 * and no bare `confirm(` (the browser dialog; use useConfirm). Add a path
 * when an area is migrated; never remove one.
 */
const SEMANTIC_TOKEN_PATHS = [
  'apps/hoa/src/app/(dashboard)/page.tsx',
  'apps/hoa/src/components/dashboard/ActivityTrend.tsx',
  'apps/hoa/src/components/dashboard/ApprovalsInbox.tsx',
  'apps/hoa/src/components/dashboard/AtRiskThisWeek.tsx',
  'apps/hoa/src/components/dashboard/BreakdownList.tsx',
  'apps/hoa/src/components/dashboard/ComplianceHeatMap.tsx',
  'apps/hoa/src/components/dashboard/DailyDigestCard.tsx',
  'apps/hoa/src/components/dashboard/LeaseSummaryCard.tsx',
  'apps/hoa/src/components/dashboard/MailTriageCard.tsx',
  'apps/hoa/src/components/dashboard/NextMeeting.tsx',
  'apps/hoa/src/app/(auth)',
  'apps/hoa/src/app/onboarding',
  'apps/hoa/src/app/(dashboard)/vendors',
  'apps/hoa/src/app/(dashboard)/rfps',
  'apps/hoa/src/app/(dashboard)/documents',
  'apps/hoa/src/app/(dashboard)/legal',
  'apps/hoa/src/app/(dashboard)/ai',
  'apps/hoa/src/app/(dashboard)/settings/page.tsx',
  'apps/hoa/src/app/(dashboard)/settings/ProfileForm.tsx',
  'apps/hoa/src/app/(dashboard)/settings/members',
  'apps/hoa/src/app/(dashboard)/settings/mailbox',
  'apps/hoa/src/components/auth',
  'apps/hoa/src/components/knowledge',
  'apps/hoa/src/components/settings',
  'apps/hoa/src/components/vendors',
  'apps/hoa/src/app/(dashboard)/approvals',
  // BL-016 board packet (prints; dark tokens swap to light in print).
  'apps/hoa/src/app/(dashboard)/meetings/[id]/packet',
]

const PALETTE =
  /\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|decoration|placeholder)-(?:red|amber|emerald|green|yellow|blue|gray|slate|zinc|neutral|stone|orange|lime|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b|\bbg-(?:white|black)\b|\bdark:/

/** Exported for the self-test below. */
export function usesRawPalette(src: string): boolean {
  return PALETTE.test(src)
}

/** A call to the browser's confirm(), bare or via window. Not `await confirm({` from useConfirm. */
export function usesNativeConfirm(src: string): boolean {
  return /(?:^|[^.\w])confirm\(\s*[`'"]/m.test(src) || /\bwindow\.confirm\s*\(/.test(src)
}

describe('semantic tokens in restyled areas', () => {
  it('detector self-test', () => {
    expect(usesRawPalette('className="bg-emerald-50 text-emerald-800"')).toBe(true)
    expect(usesRawPalette('className="text-gray-500"')).toBe(true)
    expect(usesRawPalette('className="dark:bg-slate-900"')).toBe(true)
    expect(usesRawPalette('className="bg-white"')).toBe(true)
    expect(usesRawPalette('className="bg-success-subtle text-success text-muted"')).toBe(false)
    expect(usesRawPalette('className="bg-danger-solid text-on-solid"')).toBe(false)
    expect(usesNativeConfirm("if (!confirm('Delete?')) return")).toBe(true)
    expect(usesNativeConfirm('const ok = await confirm({ title: "x" })')).toBe(false)
  })

  it('no hard-coded palette classes, dark: variants or native confirm()', () => {
    const files = SEMANTIC_TOKEN_PATHS.flatMap((p) => {
      const full = path.join(repoRoot, p)
      return statSync(full).isDirectory() ? walkSource(full) : [full]
    })
    expect(files.length).toBeGreaterThan(40)
    const offenders = files
      .filter((f) => {
        const src = readFileSync(f, 'utf8')
        return usesRawPalette(src) || usesNativeConfirm(src)
      })
      .map((f) => path.relative(repoRoot, f))
    expect(offenders).toEqual([])
  })
})

// ── Rule 7: restyled areas stay on semantic tokens ────────────────────────

describe('semantic colour tokens (design-system v2 §5)', () => {
  // Areas already migrated to v2. A raw palette class (`bg-emerald-50`,
  // `text-gray-500`) or a `dark:` variant here means a colour that does not
  // theme and whose contrast nobody checked. Extend this list as other
  // areas are restyled; never shrink it.
  const MIGRATED = [
    'apps/hoa/src/app/resident',
    'apps/hoa/src/app/admin',
    'apps/hoa/src/components/resident',
    'apps/hoa/src/components/admin',
    'apps/pm/src',
    'apps/eviction/src',
    'apps/marketing/src',
  ]
  const PALETTE =
    /\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|decoration|placeholder|shadow)-(?:white|black|gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d+)?\b|\bdark:[a-z]/

  it('no palette classes or dark: variants in migrated areas', () => {
    const offenders = MIGRATED.flatMap((d) => walkSource(path.join(repoRoot, d)))
      .filter((f) => PALETTE.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(repoRoot, f))
    expect(offenders).toEqual([])
  })
})

// ── Rule 8: empty states carry the next action (BL-012) ──────────────────

/**
 * The 13 highest-traffic board pages, from the sidebar (components/layout/
 * nav.ts): every `EmptyState` they render must pass an `action` — the one
 * next step ("Add a property", "Connect bank", "Upload a document"). A
 * board member who opens an empty page is never left without somewhere to
 * go. Route → the files that render its empty states (properties renders
 * its list from a co-located component). No allowlist: all 13 comply, and
 * a route may be added here but never removed.
 *
 * A failed read is `LoadFailed`, never `EmptyState` (rule 2, phase 1); this
 * rule leaves that distinction alone.
 */
const EMPTY_STATE_ACTION_ROUTES: Record<string, string[]> = {
  '/inbox': ['(dashboard)/inbox/page.tsx'],
  '/properties': ['(dashboard)/properties/PropertyList.tsx'],
  '/violations': ['(dashboard)/violations/page.tsx'],
  '/arc': ['(dashboard)/arc/page.tsx'],
  '/meetings': ['(dashboard)/meetings/page.tsx'],
  '/events': ['(dashboard)/events/page.tsx'],
  '/communications': ['(dashboard)/communications/page.tsx'],
  '/tickets': ['(dashboard)/tickets/page.tsx'],
  // BL-046: the no-association state is a shared component.
  '/dues': ['(dashboard)/dues/page.tsx', '(dashboard)/_components/AssociationNotSetUp.tsx'],
  '/accounting/bank': ['(dashboard)/accounting/bank/page.tsx', '(dashboard)/_components/AssociationNotSetUp.tsx'],
  '/vendors': ['(dashboard)/vendors/page.tsx'],
  '/documents': ['(dashboard)/documents/page.tsx'],
  // BL-014: the approvals inbox joined the sidebar.
  '/approvals': ['(dashboard)/approvals/page.tsx'],
}

/**
 * Line numbers of every `<EmptyState …>` element in `src` whose props have
 * no `action=`. Walks the opening tag tracking `{}` depth, so a `>` inside
 * an expression prop (`action={<Button>…</Button>}`) doesn't end the tag
 * and an `action=` nested inside another prop's JSX doesn't count.
 * Exported for the self-test below.
 */
export function emptyStatesWithoutAction(src: string): number[] {
  const out: number[] = []
  for (const m of src.matchAll(/<EmptyState\b/g)) {
    let depth = 0
    let topLevel = ''
    for (let i = m.index + m[0].length; i < src.length; i++) {
      const c = src[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (depth === 0) {
        if (c === '"') {
          const end = src.indexOf('"', i + 1)
          i = end === -1 ? src.length : end
          continue
        }
        if (c === '>' || (c === '/' && src[i + 1] === '>')) break
        topLevel += c
      }
    }
    if (!/(?:^|\s)action=/.test(topLevel)) out.push(src.slice(0, m.index).split('\n').length)
  }
  return out
}

describe('empty states carry the next action (BL-012)', () => {
  it('detector self-test', () => {
    expect(emptyStatesWithoutAction('<EmptyState title="x" />')).toEqual([1])
    expect(emptyStatesWithoutAction('<EmptyState title="a > b" action={<Button>Go</Button>} />')).toEqual([])
    expect(
      emptyStatesWithoutAction('<EmptyState\n  title="x"\n  description={<p>see <Link href="/a">here</Link></p>}\n/>'),
    ).toEqual([1])
    // `action=` inside another prop's JSX is not the EmptyState's action.
    expect(emptyStatesWithoutAction('<EmptyState title="x" description={<Foo action={1} />} />')).toEqual([1])
    // secondaryAction alone is not a primary action.
    expect(emptyStatesWithoutAction('<EmptyState title="x" secondaryAction={<a />} />')).toEqual([1])
    expect(
      emptyStatesWithoutAction(
        '<EmptyState\n  title={`No ${s} tickets`}\n  action={ok ? <A /> : <B />}\n/>\n<EmptyState title="y" />',
      ),
    ).toEqual([5])
  })

  it('covers 13 routes, each rendering at least one EmptyState', () => {
    expect(Object.keys(EMPTY_STATE_ACTION_ROUTES)).toHaveLength(13)
    for (const [route, files] of Object.entries(EMPTY_STATE_ACTION_ROUTES)) {
      const src = files.map((f) => readFileSync(path.join(repoRoot, 'apps/hoa/src/app', f), 'utf8')).join('\n')
      expect(src, `${route} renders no EmptyState — is the list stale?`).toMatch(/<EmptyState\b/)
    }
  })

  it('every EmptyState on those routes has an action', () => {
    const offenders = Object.values(EMPTY_STATE_ACTION_ROUTES)
      .flat()
      .flatMap((f) => {
        const src = readFileSync(path.join(repoRoot, 'apps/hoa/src/app', f), 'utf8')
        return emptyStatesWithoutAction(src).map((line) => `apps/hoa/src/app/${f}:${line}`)
      })
    expect(offenders, 'Give each EmptyState a real next step via `action` (an existing route or dialog).').toEqual([])
  })
})

// ── Rule 9: setup gaps offer the fix, not "Contact support" (BL-064) ─────

/**
 * An association can exist with incomplete books (no funds, chart of
 * accounts or fiscal period). These states used to say "Contact support";
 * an org admin can now open the books in place (`BooksNotOpen` /
 * `OpenBooksForm`, which run `setUpAssociationCore`), and a board member
 * is sent to the admins. A file may be added here, never removed.
 */
const OPEN_BOOKS_FILES = [
  '(dashboard)/accounting/trial-balance/page.tsx',
  '(dashboard)/accounting/periods/page.tsx',
  '(dashboard)/accounting/coa/page.tsx',
  '(dashboard)/accounting/invoices/new/page.tsx',
  '(dashboard)/accounting/reports/cash-flow/page.tsx',
  '(dashboard)/accounting/reports/income-statement/page.tsx',
  '(dashboard)/accounting/bank/LinkPlaidButton.tsx',
]

/** Pages whose no-association state is the shared component (BL-046/064). */
const ASSOCIATION_NOT_SET_UP_PAGES = [
  '(dashboard)/leases/page.tsx',
  '(dashboard)/settings/payments/page.tsx',
  '(dashboard)/settings/reminders/page.tsx',
]

describe('setup gaps offer the fix (BL-064)', () => {
  const read = (f: string) => readFileSync(path.join(repoRoot, 'apps/hoa/src/app', f), 'utf8')

  it.each(OPEN_BOOKS_FILES)('%s offers "Open the books" instead of "Contact support"', (f) => {
    const src = read(f)
    expect(src).toMatch(/<(?:BooksNotOpen|OpenBooksForm)\b/)
    // An invariant breach ("the database should not allow this") may still
    // say contact support; a missing setup step may not.
    expect(src).not.toMatch(/Contact support(?: to| if|\.)/i)
  })

  it.each(ASSOCIATION_NOT_SET_UP_PAGES)('%s uses AssociationNotSetUp and keeps LoadFailed', (f) => {
    const src = read(f)
    expect(src).toMatch(/<AssociationNotSetUp\b/)
    expect(src).toMatch(/<LoadFailed\b/)
    expect(src).not.toMatch(/No association (?:set up yet|configured)/)
  })
})
