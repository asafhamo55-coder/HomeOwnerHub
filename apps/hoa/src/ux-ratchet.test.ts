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
const DISCARDS_ERROR_ALLOWLIST = [
  'apps/eviction/src/app/(dashboard)/cases/[id]/page.tsx',
  'apps/eviction/src/app/(dashboard)/settings/billing/page.tsx',
  'apps/hoa/src/app/(dashboard)/accounting/bank/[accountId]/reconcile/page.tsx',
  'apps/hoa/src/app/(dashboard)/accounting/bank/queue/page.tsx',
  'apps/hoa/src/app/(dashboard)/accounting/payment-plans/new/page.tsx',
  'apps/hoa/src/app/(dashboard)/accounting/payment-plans/page.tsx',
  'apps/hoa/src/app/(dashboard)/accounting/recurring/page.tsx',
  'apps/hoa/src/app/(dashboard)/communications/new/page.tsx',
  'apps/hoa/src/app/(dashboard)/inbox/[id]/page.tsx',
  'apps/hoa/src/app/(dashboard)/meetings/[id]/edit/page.tsx',
  'apps/hoa/src/app/(dashboard)/meetings/[id]/page.tsx',
  'apps/hoa/src/app/(dashboard)/properties/[id]/page.tsx',
  'apps/hoa/src/app/(dashboard)/settings/billing/page.tsx',
  'apps/hoa/src/app/(dashboard)/violations/[id]/edit/page.tsx',
  'apps/hoa/src/app/(dashboard)/violations/[id]/page.tsx',
  'apps/hoa/src/app/(dashboard)/violations/approval-queue/page.tsx',
  'apps/hoa/src/app/admin/admins/page.tsx',
  'apps/hoa/src/app/resident/account/page.tsx',
  'apps/hoa/src/app/vendor-onboard/[token]/page.tsx',
  'apps/pm/src/app/(dashboard)/page.tsx',
  'apps/pm/src/app/(dashboard)/rent/page.tsx',
  'apps/pm/src/app/(dashboard)/settings/billing/page.tsx',
  'apps/pm/src/app/(dashboard)/setup/page.tsx',
]

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
  'apps/hoa/src/app/(dashboard)/accounting/bank/[accountId]/reconcile/page.tsx',
  'apps/hoa/src/app/(dashboard)/accounting/bank/queue/page.tsx',
  'apps/hoa/src/app/(dashboard)/communications/new/page.tsx',
  'apps/hoa/src/app/(dashboard)/properties/[id]/page.tsx',
  'apps/hoa/src/app/(dashboard)/violations/approval-queue/page.tsx',
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
