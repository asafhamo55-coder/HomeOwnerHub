# Sub-project E — Enterprise UI/UX: audit and phased plan

**Date:** 2026-10-15 · **Branch:** `claude/ux-audit` (from `bdadecd`) · **Status:** discovery + plan; no UI rewrites yet

## How this audit was done, and what it cannot see

Code-level only. Browser automation is unavailable (the owner uses Safari, no
Chrome extension), so nothing here was observed on a rendered page. Every
finding cites `file:line` and was found by reading source or by a scripted scan
of every `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`
and every `<label>`, `<input>`, `<table>` and `href` in `apps/*/src` and
`packages/ui/src`.

What that means for trust, in the spirit of `docs/NEXT.md`'s recurring lesson:

- **Visual findings are inferences.** "Table overflows at 375px" means "a table
  with N columns has no `overflow-x-auto` ancestor in the same file"; a parent
  component could still wrap it. Each such item is marked *inferred*.
- **There is no traffic data.** No product analytics library exists in any
  app (`grep -ri "posthog|plausible|gtag|@vercel/analytics"` finds nothing
  but test fixtures). "Highest-traffic" below is a judgement from: post-login
  landing routes, sidebar order, the resident bottom tab bar, and the
  `docs/MADISON_PARK_DEMO.md` script. Recorded as a decision, not a measurement.
- **The dead-link scan only sees string-literal hrefs.** Template-literal
  hrefs are matched segment-by-segment with `${…}` treated as a wildcard;
  hrefs assembled from variables are invisible to it.

## Page count

| App | `page.tsx` | `loading.tsx` | `error.tsx` | `not-found.tsx` | Notes |
|---|---:|---:|---:|---:|---|
| `apps/hoa` | **121** | 2 (both under `/admin`) | 3 | 3 | 100 board/admin pages, 16 resident, 9 platform-admin, 9 auth/public, 2 onboarding, 1 offline |
| `apps/pm` | **9** | 0 | 1 (root) | 0 | |
| `apps/eviction` | **9** | 0 | 1 (root) | 0 | no `/cases` index; `/` is the case list |
| `apps/marketing` | **19** | 0 | 1 (root) | 0 | static; own site kit, does not use `@homeowner-portal/ui` |
| **Total** | **158** | | | | the "~115 pages" estimate was the HOA app alone |

## What already exists (the design-system baseline to reuse)

`packages/ui` (`@homeowner-portal/ui`) is a real, adopted component library —
113 of 121 HOA pages import from it. It already has:

- **Shell:** `AppShell`, `AppShellSidebar/Main/Header/Content`, `SidebarBrand/Nav/Section/Footer`, `NavItem`, `HubSwitcher`
- **Page furniture:** `PageHeader` (title/description/actions), `BackLink`, `Tabs` (page-level sub-nav), `WizardStepper`
- **Content:** `Card*`, `StatCard`, `KeyValue/KeyValueList`, `Badge`, `StatusBadge` (tone + humanized label), `Separator`
- **Feedback:** `Alert`, `EmptyState`, `Skeleton`, `ToastProvider/useToast`, `ConfirmProvider/useConfirm`
- **Inputs:** `Button` (with `loading`, `asChild`), `Input` (with an `error` prop nobody passes), `Textarea`, `Select`
- **AI gate:** `BarBGate`
- **Theme:** per-app CSS variables in each `globals.css` (light + dark), HOA base font 18px

Usage across all app pages: `Card` 104, `Badge` 68, `EmptyState` 46, `Button` 31,
`Alert` 29, `PageHeader` **22**, `BackLink` 21, `StatusBadge` **7**, `Input` **2**, `Skeleton` **1**.

App-local primitives that should be promoted rather than rewritten:

- `apps/hoa/src/app/(dashboard)/properties/PropertyListPager.tsx` and the inbox pager (`inbox/page.tsx:170`) — the only two paginated lists; both render "Showing X–Y of Z".
- `apps/hoa/src/components/resident/screen.tsx` — `ScreenHeader`, `SectionLabel`, `IconTile`, `TappableRow`, `ScreenEmpty`, `Panel`: a coherent consumer-style kit used by the resident portal. Keep it as the resident variant; do not force the board `PageHeader` onto it.
- `apps/hoa/src/app/(dashboard)/error.tsx` — good route error boundary (Sentry capture, no raw message, retry + home, digest reference). Template for the others.
- `apps/hoa/src/components/layout/NavigationProgress.tsx` — top progress bar on link click.

**Missing primitives** (each is the root cause of a finding below): a form
`Field` (label/hint/error wiring), a `DataTable`/scroll container, a `Pager`,
a page-level `LoadFailed` state, and a `Page` container that fixes width.

## Top findings, ranked by user impact

Ranking = (how many users hit it) × (how badly it misleads or blocks them).
"Misleads" ranks above "looks inconsistent": a page that lies is worse than a
page that is ugly.

### 1. Query failures render as "nothing here" — the UI lies about empty data *(high)*

Pages destructure `{ data }` and never read `error`, so an RLS denial, timeout
or schema drift renders the empty state.

- `apps/hoa/src/app/(dashboard)/violations/page.tsx:86` — `const { data } = await query`; a failure shows `EmptyState` "No violations on file" (`:156`).
- `apps/hoa/src/app/(dashboard)/meetings/page.tsx:56` and `:73` — same pattern.
- **23 HOA pages (29 counting pm and eviction) query Supabase directly and
  never reference `error`** (marked `NO-ERR` in the inventory). Most of the rest go through `apps/hoa/src/lib/*`
  helpers, which overwhelmingly return `data ?? []`: only 7 `if (error) throw`
  sites exist in all of `lib/`.
- The opposite failure also exists: `apps/hoa/src/app/(dashboard)/dues/page.tsx:136` renders the raw `error.message` to the user — the thing `(dashboard)/error.tsx` was written to prevent.

For a board treasurer, "no overdue dues" when the query failed is a wrong
financial answer. This is the single highest-impact item.

### 2. Dashboard "At risk this week" dues rows linked to a 404 *(high — fixed in this branch)*

`apps/hoa/src/lib/dashboard/queries.ts:954` built `/accounting/assessments/${id}`.
No such route exists. Every overdue-dues row on the landing page of every
board user was a dead click. **Fixed:** now `/dues`, matching what
`lib/dashboard/board-signals.ts:129` already uses for `dues_overdue`.

### 3. Mobile nav drawer never closed after picking a page *(high — fixed in this branch)*

`packages/ui/src/layouts/AppShell.tsx:30-35` closed the drawer only on
`popstate`. Next `<Link>` navigation is `pushState`, which never fires
`popstate`, and the layout holding the state does not remount. On a phone,
tapping any sidebar item navigated *underneath* the still-open drawer; the
user had to find the X. Affects all three app shells (hoa board, platform
admin, pm, eviction). **Fixed:** a delegated `onClickCapture` on the drawer
closes it when any `a[href]` inside is clicked. *Not verified on a device* —
it is a two-line React handler, checked by typecheck only.

### 4. Form labels are not associated with their inputs *(high, accessibility)*

**73 files** render `<label>` with no `htmlFor` beside a sibling `<input>` with
no `id`, e.g. `apps/hoa/src/app/(dashboard)/vendors/[id]/edit/EditVendorForm.tsx:56-57`
and `.../properties/[id]/edit/EditPropertyForm.tsx:54-78`. Screen readers
announce "edit text, blank"; clicking the label does not focus the field.
Repo-wide, `aria-invalid` appears **0** times and `aria-describedby` once.

### 5. Forms have no field-level validation feedback *(high)*

81 files contain a `<form>`; **6** render a per-field error. The rest rely on
HTML `required` plus a toast (`toast({ tone: 'error' … })` in 23 files) that
names no field and disappears. `Input` already has an `error` prop; it is
passed **0** times. Long forms (`accounting/invoices/new/EnterBillForm.tsx`, 7
fields; `properties/[id]/RecordCollectionEvent.tsx`, 6) are where this costs most.

### 6. Lists silently truncate with no pagination *(medium-high)*

Only `/properties` and `/inbox` paginate. Elsewhere a hard cap drops rows
with no "showing first N" notice:

- `(dashboard)/violations/page.tsx:74` — `.limit(100)`
- `(dashboard)/dues/page.tsx:77` — `.limit(500)` (`WhoOwesPanel` totals derive from these rows)
- `(dashboard)/meetings/page.tsx:62` — `.limit(50)`
- `(dashboard)/violations/approval-queue/page.tsx:43` — `.limit(50)`
- `(dashboard)/accounting/bank/queue/page.tsx:60` — `.limit(500)`
- `resident/announcements/page.tsx:108` — `.limit(300)`

Harmless at Madison Park's 49 units; wrong at a 400-unit association.

### 7. No loading UI for 112 of 121 HOA pages, and none in pm/eviction *(medium)*

`loading.tsx` exists only at `app/admin/` and `app/admin/analytics/`. Every
board, resident, pm and eviction page is `force-dynamic` server rendering with
no Suspense boundary (`Suspense` appears in 2 files, `Skeleton` in 3). The
`NavigationProgress` bar mitigates soft navigation; hard loads and slow
queries show the previous page frozen. The dashboard (`(dashboard)/page.tsx`,
12 widgets) is the worst case.

### 8. Page headers and containers are hand-rolled in ~75% of pages *(medium, consistency)*

- `PageHeader` on 22 pages; elsewhere `<h1>` with 15 different class strings
  (42× `text-2xl font-bold text-foreground`, 16× `text-2xl font-bold`, 22× bare `<h1>`, plus one-offs like `text-3xl font-semibold tracking-tight`).
- 30 files hand-roll an `ArrowLeft` back link; 21 use `BackLink`.
  Example: `(dashboard)/legal/updates/page.tsx:47-54`.
- Content width is chosen per page: `max-w-3xl` ×50, `4xl` ×26, `5xl` ×19,
  `2xl` ×13, `6xl` ×3 — so the title jumps horizontally between sibling pages.
- 17 pages (11 HOA, 3 pm, 3 eviction) `return null` when there is no org (`(dashboard)/page.tsx:73`,
  `violations/page.tsx:63`, …): a blank white content area, not a message.

### 9. Wide tables with no horizontal scroll container *(medium, mobile — inferred)*

48 `<table>` elements, 22 `overflow-x-auto` wrappers, no `Table` primitive.
Unwrapped examples: `app/admin/tenants/page.tsx:80`,
`(dashboard)/communications/[id]/page.tsx:174`,
`(dashboard)/accounting/bank/[accountId]/reconcile/page.tsx:70`. The ten
accounting pages with report/ledger tables are the dense ones a treasurer opens on a phone.

### 10. Colour-only status on the dashboard heat map *(medium, accessibility)*

`apps/hoa/src/components/dashboard/ComplianceHeatMap.tsx:104-119` encodes
red/amber/green purely as background colour; the explanation is only in a
`title` attribute, which touch devices and most screen readers never surface.
It is on the landing page and called out in the demo script.

### Further findings (lower impact, folded into later phases)

11. **pm and eviction have no `not-found.tsx`** and only a root `error.tsx` (outside the shell): a bad URL shows Next's unstyled 404 with no nav.
12. **Marketing "Sign in" was a 404 (fixed in phase 1, decision 19).** `apps/marketing/src/components/site/nav.tsx:123` links `/login`, which does not exist in the marketing app (no rewrites in `next.config.ts`). *Not fixed:* the docs disagree on the HOA app's production host (`hoa.homeownerhub.com` in `docs/DEPLOY.md:11` vs `homeowner-hub.vercel.app` in `docs/DEPLOY_PHASE_C.md:17`), and guessing a domain is not "clearly safe". Needs the owner to name the URL (or a `NEXT_PUBLIC_HOA_URL` env var).
13. **Three `window.confirm` survivors** despite `useConfirm`: `app/admin/admins/RevokeButton.tsx:14`, `(dashboard)/settings/members/MemberRow.tsx:47`, `(dashboard)/rfps/[id]/PublishRfpButton.tsx:16`. Safari renders these as an un-styled system sheet.
14. **Status vocabulary duplicated:** 12 files define their own `*_TONES`/`*_LABELS` `Record<string, …>`; `StatusBadge` is used on 7 pages vs raw `Badge` on 68, so the same status can read differently on list and detail pages.
15. **`packages/ui/src/tokens.ts` is stale.** It documents HOA as teal `#00C9A7`; `apps/hoa/src/app/globals.css:24` ships indigo `#4F46E5`. Nothing imports `tokens`. Delete or regenerate it so nobody designs against it.
16. **Heading levels skip.** `CardTitle` always renders `<h3>` (`packages/ui/src/components/Card.tsx`), so most pages go h1 → h3.
17. **Board can open an "admin" page.** `(dashboard)/legal/updates/page.tsx` is titled "Law updates — admin" but has no page-level gate beyond the board/admin layout. Whether board members *should* manage law updates is a product call; flagged, not changed. (Mutations' authz is out of scope for a UX audit.)

### Checked and found fine

- **Nav reachability:** every non-token, non-auth page is linked from somewhere (sidebar, page tabs, or a parent page). The only unreferenced pages are `/offline` (service worker), `/verify`, `/reset-password` (email links), and token pages (emailed).
- **`div onClick`:** the only non-button click handler is the drawer backdrop (`AppShell.tsx:57`), which is `aria-hidden` and duplicated by a real close button. Good.
- **Sidebar role filtering:** `HoaSidebar.tsx:104-123` deliberately hides admin-only settings from board members, with a comment explaining why.

## Decisions (made here, with reasoning)

1. **Extend `packages/ui`; do not adopt a new component library.** It is
   already used by 90% of app pages (125 of 139, marketing excluded) and is shadcn-shaped (cva + `cn`). A swap
   (Radix Themes, MUI, Mantine) would be a 158-page rewrite to fix problems
   that are mostly *missing* primitives, not bad ones.
2. **Two shells, not one.** Board/admin/pm/eviction keep `AppShell`; the
   resident portal keeps its mobile-first top-bar + tab-bar shell and
   `screen.tsx` kit. Residents are on phones; boards are at desks. Unifying
   them would make one of the two worse.
3. **Fix states before visuals.** Phase 1 is about pages telling the truth
   (error vs empty vs loading vs truncated) on the pages people actually open.
   Restyling comes after, because a consistent header on a page that lies is
   no improvement.
4. **Enforce with a unit test, not lint.** `pnpm lint` has never worked here
   (CLAUDE.md §4). A vitest "UX ratchet" that scans `app/**/page.tsx` source —
   like the scripts used for this audit — runs in CI today. It holds an
   allowlist of not-yet-migrated pages that may only shrink.
5. **Highest-traffic set (phase 1)** is chosen as: the two post-login landing
   pages (`/` for boards, `/resident` for residents); the HOA sidebar's
   first Community items in order; the money pages a treasurer opens weekly;
   the resident bottom tab bar. That is 12 routes.
6. **Marketing stays on its own kit.** It is a static brochure with a
   different visual brief; the only change it needs is finding 12.

### Phase 1 decision log (branch `claude/ux-phase1`)

Decisions made while implementing phase 1, recorded so the next phase does
not have to rediscover them.

7. **`LoadFailed` does not log; `loadOrFail` does.** The baseline table said
   `LoadFailed` "logs to Sentry". `packages/ui` has no Sentry dependency and
   `LoadFailed` must be renderable anywhere, so it is presentational only and
   takes *no* error prop at all (a type-level guarantee that raw messages
   cannot reach it). Reporting happens once, in `apps/hoa/src/lib/load-or-fail.ts`,
   via `@homeowner-portal/observability`'s `reportError` with a `redactText`-ed
   message and `{ what, code }` context — no row values.
8. **`loadOrFail`'s failure branch is just `{ ok: false }`.** No error object,
   so a page has nothing to render from it. Rejections are failures too.
   `redirect()` / `notFound()` thrown through it are re-thrown via Next's
   `unstable_rethrow`, so an auth redirect never becomes a "couldn't load" box.
   A sibling `tryLoad(what, fn)` gives the same contract for lib helpers that
   *throw* (inbox, properties).
9. **Inbox and properties are not wrapped in `Page`.** Both are full-height
   split panes with their own scrolling; a fixed-width container breaks them.
   They adopt `Pager` (properties also `LoadFailed`) and are listed as
   pager-only in the ratchet. Inbox load failures were already honest — every
   `lib/inbox/queries.ts` read throws to `(dashboard)/error.tsx` — so it keeps
   that path.
10. **Helpers that every page shares were fixed at the helper.** `listTicketsForBoard`,
   `listCommunications`, the resident `listMy*` readers and `getResidentDashboard`
   now report failure. The resident `listMy*` functions keep their array
   signature for the non-phase-1 callers but *throw* on failure (→ resident
   error boundary, not an empty list); phase-1 pages use the new `loadMy*`
   variants and show `LoadFailed` per section.
11. **Totals no longer come from a truncated page.** `/dues`' "$X overdue"
   headline was summed from the first 500 rows; it now has its own query over
   every overdue charge. `/tickets`' "N open" uses a count query. On
   `/communications` the summary tiles still sum the visible page, and the
   page now says so when there is more than one page. On `/dues`, a fiscal
   period split across a page boundary labels its billed/paid figures "on this
   page only".
12. **Page sizes kept from the old caps** — violations 100, dues 500,
   meetings 50, communications 100, resident announcements 50 — except tickets
   (hidden 200 cap → 100 per page, for consistency with violations).
   Resident announcements read up to 1000 recipient rows (was 300) and say so
   if that cap is hit.
13. **`Pager` hides itself when one page holds everything.** The inbox used to
   show "Showing 1–5 of 5" on a single page; the filter chips already carry the
   count. A `?page=` past the end says so and links to page 1 instead of
   rendering an empty list.
14. **Dashboard KPI tiles show "—" and "Couldn't load" when their source
   failed.** The helpers already computed `failed` flags (used by
   `board-signals`) but the tiles ignored them and showed `$0` / `0`.
   `getCommunitySnapshot` gained the same flag. "This week" no longer says
   "nothing urgent" when the at-risk read failed. Not done: the heat map and
   donuts still render a failed read as empty (phase 3/4).
15. **`NoOrgSelected` lives in `packages/ui`** with a `noun` prop: "community"
   (HOA), "workspace" (pm, eviction).
16. **pm and eviction 404s keep the shell via a catch-all.** A
   `(dashboard)/not-found.tsx` alone only catches `notFound()` calls; an
   unmatched URL renders the *root* not-found outside the layout. Each app
   now has `(dashboard)/[...missing]/page.tsx` calling `notFound()`. More
   specific routes (`(auth)`, `onboarding`, `api`, `auth/callback`) still win.
   Side effect: an unauthenticated request for an unknown URL now redirects
   to `/login` (the layout's auth check) instead of a bare 404. HOA was not
   given a catch-all: its root also hosts the resident and admin trees.
17. **The ratchet's detectors are narrower than the audit's scan.** It flags
   `const { data } = await …` without `error` and `(await …).data`; the audit
   also counted other shapes. Its allowlist (25 pages now) is what *this*
   detector sees, and a detector self-test pins its behaviour. Also enforced:
   no `if (!org) return null`, no `{error.message}</` in a page, `<Page width>`
   only narrow/default/wide.
18. **Two raw-message leaks outside the 12 routes were fixed** because the
   ratchet rule would otherwise have needed an allowlist: `/documents` and
   the `/properties/[id]` list pane.
19. **Finding 12 resolved:** marketing "Sign in" now points to the live HOA
   production host, `https://www.homeownerledger.com/login` (owner-confirmed;
   the hostnames in `docs/DEPLOY*.md` are stale).

## Proposed design-system baseline (additions to `packages/ui`)

| New primitive | Built from | Replaces | Contract |
|---|---|---|---|
| `Page` | `PageHeader` + `BackLink` + `Tabs` | per-page `mx-auto max-w-*` + hand-rolled header | `width: 'narrow' \| 'default' \| 'wide'` (3xl / 5xl / 7xl only); optional `back`, `tabs`, `actions`; renders the only `<h1>` |
| `LoadFailed` | `Alert` + `(dashboard)/error.tsx` copy | silent `data ?? []`, raw `error.message` | takes `what` ("violations"); logs to Sentry; never shows the raw message |
| `loadOrFail(query)` helper (app-side, `lib/`) | — | `const { data } = await …` | returns `{ ok: true, data } \| { ok: false }` so the page must branch; logs the error |
| `Field` | `React.useId` | bare `<label>` + `<input>` | wires `htmlFor`/`id`, `hint`, `error` → `aria-invalid` + `aria-describedby`; works with `Input`, `Select`, `Textarea` and raw inputs via render-prop |
| `DataTable` | `Card` + `overflow-x-auto` | 48 hand-styled tables | header styling, numeric column alignment, optional sticky first column; *not* a data-grid (no client sort/filter in v1) |
| `Pager` | `PropertyListPager` | `.limit(N)` truncation | URL-param driven (`?page=`), "Showing X–Y of Z"; server components pass `count: 'exact'` |
| `PageSkeleton` | `Skeleton` | nothing (blank) | header + 3 card placeholders; used by `loading.tsx` |
| `STATUS` registry | `StatusBadge` | 12 local tone maps | one map per domain (violation, dues, ticket, arc, rfp, vendor, case) exported from one module |

Explicitly **not** in the baseline: a modal/sheet primitive (only 3 dialog
usages today; revisit in phase 4), icon set changes, typography scale
changes, dark-mode work (already shipped via CSS variables).

## Phased plan

Each phase is one PR, independently shippable, and leaves the repo better
even if no later phase happens. Sizes are agent-days of focused work.

### Phase 0 — done in this branch

- Dead dashboard link (finding 2) and mobile drawer (finding 3).
- `pnpm typecheck` (turbo, 12/12 tasks) and `pnpm test:unit` (1699 tests / 103 files) green after both changes.

### Phase 1 — Shared shell + truthful states on the 12 highest-traffic pages (~3 days)

Scope:

1. Add `Page`, `LoadFailed`, `PageSkeleton`, `Pager`, `DataTable` to `packages/ui`; add `loadOrFail` to `apps/hoa/src/lib`.
2. `loading.tsx` (using `PageSkeleton`) at `apps/hoa/src/app/(dashboard)/`, `apps/hoa/src/app/resident/`, `apps/pm/src/app/(dashboard)/`, `apps/eviction/src/app/(dashboard)/`. One file per shell covers every page under it.
3. `not-found.tsx` + in-shell `error.tsx` for pm and eviction (copy hoa's).
4. Migrate these routes to `Page` + `loadOrFail` + `LoadFailed`, with a `Pager` wherever there is a `.limit()`:
   - Board: `/`, `/inbox`, `/properties`, `/violations`, `/dues`, `/tickets`, `/communications`, `/meetings`
   - Resident: `/resident`, `/resident/dues`, `/resident/requests`, `/resident/announcements` (resident pages get `LoadFailed` and `Pager` only; they keep `ScreenHeader`)
5. Replace all 17 `if (!org) return null` (one-line change each, all three apps) with an explicit "no community selected" state (shared component, one change per page).
6. `ComplianceHeatMap`: visible legend + per-cell `aria-label`; status letter or icon in red/amber cells.
7. Add `apps/hoa/src/ux-ratchet.test.ts`: fails if a page in the migrated set stops using `Page`, if any `page.tsx` destructures `{ data }` from a Supabase call without `error` (allowlist the current 23, shrink-only), or if a new `.limit(` appears in a page without `Pager`.

Exit criteria: ratchet test green; typecheck + unit green; a manual Safari pass by
the owner on the 12 routes at phone width (the one check an agent cannot do).

### Phase 2 — Forms (~3 days)

`Field` primitive; migrate all 73 files with unassociated labels (mechanical,
grep-driven list in finding 4). Server actions return
`{ ok: false, fieldErrors }` from their existing zod schemas (16 app files
already use zod) and forms render them inline; toasts remain for
success and non-field errors. Replace the 3 `window.confirm`. Ratchet: no
`<label` without `htmlFor` outside `Field`.

### Phase 3 — Money (~3 days)

All 23 `/accounting/*` pages + `/dues/new` + `/settings/billing`. `DataTable`
for the 14 accounting pages that render tables (numeric alignment, scroll on mobile, print
stylesheet for board packets), `Page` with the existing `AccountingTabs`,
`Pager` on ledger and bank queue, `LoadFailed` everywhere a number is shown.
Treasurer-facing; correctness of "no data" vs "failed" matters most here.

### Phase 4 — Community + vendors + knowledge (~4 days)

Remaining board pages: violations sub-pages, ARC, events, meetings detail,
communications wizard, tickets detail, leases, properties detail (960-line
page — split into sections first), vendors (7), RFPs (6), documents (4),
legal (6), AI ask. `Page`, `LoadFailed`, `STATUS` registry adoption,
hand-rolled back links → `BackLink` via `Page`.

### Phase 5 — Platform admin, resident long tail, pm, eviction (~2 days)

Platform admin (9), remaining resident pages (12), pm (9), eviction (9),
onboarding, auth pages. Marketing sign-in link once the owner names the
production HOA host (finding 12).

### Phase 6 — Cleanup (~1 day)

Delete or regenerate `tokens.ts`; `CardTitle` heading level prop; remove the
ratchet allowlists once empty; document the primitives in `packages/ui` README.

**Total:** ~16 agent-days across 6 PRs after phase 0.

## Inventory

Legend — **Gate:** where access is enforced. `(layout)` = by the route-group
layout (`(dashboard)/layout.tsx` sends residents to `/resident` and no-role
users to `/onboarding`; `admin/layout.tsx` requires `platform_admins`;
`resident/layout.tsx` sends board/admin to `/`); `+ requireX` = an additional
page-level guard. Middleware (`apps/hoa/src/middleware.ts`) requires a session
for everything not in `PUBLIC_PREFIXES`. **Header / primitives:** how the
title is rendered, and how many distinct `@homeowner-portal/ui` exports the
page imports (`no ui pkg` = none). **States:** `empty` = page has an empty
state; `err` = page reads a query `error`; `NO-ERR` = page queries Supabase
directly and never reads `error`; `-` = data comes via a `lib/` helper (see
finding 1 for what those do); `table+pager` = has a table and some
range/limit/page handling.

#### apps/hoa — 121 pages

| Route | Gate | Purpose | Header / primitives | States (empty / error / table) |
|---|---|---|---|---|
| `/` | board/admin (layout) | Board dashboard (KPIs, at-risk, approvals, digest) | h1 in child/none, ui:4 | empty / NO-ERR |
| `/accounting` | board/admin (layout) | Accounting | ad-hoc h1, ui:3 | empty / - |
| `/accounting/bank` | board/admin (layout) | Bank Accounts | ad-hoc h1, ui:3 | empty / - / table |
| `/accounting/bank/[accountId]/reconcile` | board/admin (layout) | Reconcile | ad-hoc h1, ui:2 | empty / NO-ERR / table+pager |
| `/accounting/bank/queue` | board/admin (layout) | Reconciliation Queue | PageHeader, ui:5 | empty / NO-ERR |
| `/accounting/budget` | board/admin (layout) | Budgets | PageHeader, ui:6 | empty / - |
| `/accounting/budget/[id]` | board/admin (layout) | Budget | ad-hoc h1, ui:2 | - / - |
| `/accounting/budget/new` | board/admin (layout) | New Budget | ad-hoc h1, ui:2 | empty / - |
| `/accounting/coa` | board/admin (layout) | Chart of Accounts | ad-hoc h1, ui:3 | empty / - / table |
| `/accounting/invoices` | board/admin (layout) | Invoices | PageHeader, ui:7 | empty / - / table |
| `/accounting/invoices/[id]` | board/admin (layout) | Invoice | ad-hoc h1, ui:2 | - / - |
| `/accounting/invoices/new` | board/admin (layout) | Enter Bill | ad-hoc h1, ui:2 | empty / - |
| `/accounting/ledger` | board/admin (layout) | General Ledger | PageHeader, ui:7 | empty / - / table |
| `/accounting/ledger/[id]` | board/admin (layout) | Journal Entry | ad-hoc h1, ui:2 | - / - / table |
| `/accounting/payment-plans` | board/admin (layout) | Payment Plans | ad-hoc h1, ui:4 | empty / NO-ERR / table |
| `/accounting/payment-plans/new` | board/admin (layout) | New Payment Plan | ad-hoc h1, ui:2 | empty / NO-ERR |
| `/accounting/periods` | board/admin (layout) | Fiscal Periods | ad-hoc h1, ui:3 | empty / - / table |
| `/accounting/recurring` | board/admin (layout) | Recurring Entries | ad-hoc h1, ui:3 | empty / NO-ERR / table |
| `/accounting/reports` | board/admin (layout) | Accounting Reports | ad-hoc h1, ui:1 | - / - |
| `/accounting/reports/balance-sheet` | board/admin (layout) | Balance Sheet | ad-hoc h1, ui:2 | empty / - / table |
| `/accounting/reports/budget-vs-actual` | board/admin (layout) | Budget vs Actual | ad-hoc h1, ui:3 | empty / - / table |
| `/accounting/reports/cash-flow` | board/admin (layout) | Cash Flow | ad-hoc h1, ui:3 | empty / - / table |
| `/accounting/reports/income-statement` | board/admin (layout) | Income Statement | ad-hoc h1, ui:3 | empty / - / table |
| `/accounting/trial-balance` | board/admin (layout) | Trial Balance | ad-hoc h1, ui:3 | empty / - / table |
| `/ai/ask` | board/admin (layout) | Ask the Docs | ad-hoc h1, no ui pkg | - / - |
| `/arc` | board/admin (layout) | ARC review | ad-hoc h1, ui:3 | empty / - |
| `/arc/[id]` | board/admin (layout) | ARC application | ad-hoc h1, ui:5 | empty / - |
| `/communications` | board/admin (layout) | Communications | ad-hoc h1, ui:5 | empty / - |
| `/communications/[id]` | board/admin (layout) | Message | ad-hoc h1, ui:2 | empty / - / table |
| `/communications/new` | board/admin (layout) | New message | ad-hoc h1, ui:2 | empty / NO-ERR |
| `/documents` | board/admin (layout) | Documents | ad-hoc h1, ui:5 | empty / err |
| `/documents/[id]` | board/admin (layout) | Document detail | ad-hoc h1, ui:5 | - / NO-ERR |
| `/documents/governing` | board/admin (layout) | Governing Documents | ad-hoc h1, ui:5 | - / NO-ERR |
| `/documents/upload` | board/admin (layout) | Upload document | h1 in child/none, ui:4 | - / - |
| `/dues` | board/admin (layout) | Dues | ad-hoc h1, ui:5 | empty / err / table+pager |
| `/dues/new` | board/admin (layout) | Add due | PageHeader, ui:6 | - / - |
| `/events` | board/admin (layout) | Events | PageHeader, ui:5 | empty / - |
| `/events/[id]` | board/admin (layout) | Event | PageHeader, ui:9 | - / - |
| `/events/new` | board/admin (layout) | New event | h1 in child/none, ui:5 | - / - |
| `/inbox` | board/admin (layout) + requireBoardOrAdmin | Inbox | h1 in child/none, ui:1 | - / err |
| `/inbox/[id]` | board/admin (layout) + requireBoardOrAdmin | Email thread + resident rail | ad-hoc h1, no ui pkg | empty / err |
| `/inbox/compose` | board/admin (layout) + requireBoardOrAdmin | New email | ad-hoc h1, no ui pkg | empty / err |
| `/leases` | board/admin (layout) | Leases | PageHeader, ui:9 | empty / - |
| `/legal` | board/admin (layout) | State Law & Compliance | ad-hoc h1, ui:8 | empty / - |
| `/legal/ask` | board/admin (layout) | Ask state law | ad-hoc h1, ui:2 | empty / - |
| `/legal/browse` | board/admin (layout) | Browse statutes | ad-hoc h1, ui:4 | empty / - |
| `/legal/browse/[id]` | board/admin (layout) | Statute | ad-hoc h1, ui:6 | - / - |
| `/legal/updates` | board/admin (layout) | Law updates — admin | ad-hoc h1, ui:5 | empty / - |
| `/legal/updates/new` | board/admin (layout) | Post a law update | ad-hoc h1, ui:6 | empty / - |
| `/meetings` | board/admin (layout) | Meetings | ad-hoc h1, ui:4 | empty / NO-ERR |
| `/meetings/[id]` | board/admin (layout) | Meeting detail / minutes | ad-hoc h1, ui:5 | - / NO-ERR |
| `/meetings/[id]/edit` | board/admin (layout) | Edit meeting | PageHeader, ui:2 | - / NO-ERR |
| `/meetings/new` | board/admin (layout) | New minutes | h1 in child/none, ui:5 | - / - |
| `/meetings/schedule` | board/admin (layout) | Schedule meeting | h1 in child/none, ui:4 | - / - |
| `/properties` | board/admin (layout) | Properties | h1 in child/none, ui:1 | empty / err |
| `/properties/[id]` | board/admin (layout) | Property detail (residents, dues, violations, collections) | h1 in child/none, ui:8 | empty / err / table+pager |
| `/properties/[id]/edit` | board/admin (layout) | Edit property | PageHeader, ui:2 | - / - |
| `/properties/new` | board/admin (layout) | Add property | h1 in child/none, ui:4 | - / - |
| `/rfps` | board/admin (layout) | RFPs | ad-hoc h1, ui:5 | empty / - |
| `/rfps/[id]` | board/admin (layout) | RFP | PageHeader, ui:10 | - / - |
| `/rfps/[id]/bids` | board/admin (layout) | Bids | ad-hoc h1, ui:7 | empty / - |
| `/rfps/[id]/bids/[bidId]` | board/admin (layout) | Bid | ad-hoc h1, ui:6 | - / - / table |
| `/rfps/[id]/comparison` | board/admin (layout) | Bid comparison | ad-hoc h1, ui:6 | empty / - / table |
| `/rfps/new` | board/admin (layout) | New RFP | ad-hoc h1, ui:5 | - / - |
| `/settings` | board/admin (layout) + requireAdmin | Settings | ad-hoc h1, ui:6 | - / NO-ERR |
| `/settings/billing` | board/admin (layout) + requireBoardOrAdmin | Billing | ad-hoc h1, ui:7 | - / NO-ERR |
| `/settings/mailbox` | board/admin (layout) + requireAdmin | Mailbox | ad-hoc h1, ui:1 | empty / err |
| `/settings/members` | board/admin (layout) + requireBoardOrAdmin | Members | ad-hoc h1, ui:6 | - / NO-ERR |
| `/tickets` | board/admin (layout) | Tickets | ad-hoc h1, ui:3 | empty / - |
| `/tickets/[id]` | board/admin (layout) | Ticket | ad-hoc h1, ui:5 | empty / - |
| `/vendors` | board/admin (layout) | Vendors | ad-hoc h1, ui:6 | empty / - |
| `/vendors/[id]` | board/admin (layout) | Vendor detail | PageHeader, ui:10 | empty / - |
| `/vendors/[id]/compliance` | board/admin (layout) | Vendor compliance check | ad-hoc h1, ui:1 | - / - |
| `/vendors/[id]/edit` | board/admin (layout) | Edit vendor | PageHeader, ui:2 | - / - |
| `/vendors/approval-queue` | board/admin (layout) | Vendor approval queue | ad-hoc h1, ui:3 | - / - |
| `/vendors/invitations` | board/admin (layout) | Vendor invitations | ad-hoc h1, ui:6 | empty / - |
| `/vendors/new` | board/admin (layout) | New vendor | h1 in child/none, ui:4 | - / - |
| `/violations` | board/admin (layout) | Violations | ad-hoc h1, ui:7 | empty / NO-ERR |
| `/violations/[id]` | board/admin (layout) | Violation detail | PageHeader, ui:9 | - / NO-ERR |
| `/violations/[id]/edit` | board/admin (layout) | Edit violation | PageHeader, ui:2 | - / NO-ERR |
| `/violations/approval-queue` | board/admin (layout) | Violation Approval Queue | ad-hoc h1, ui:5 | - / NO-ERR |
| `/violations/new` | board/admin (layout) | New violation | h1 in child/none, ui:5 | - / NO-ERR |
| `/violations/reports` | board/admin (layout) | Resident violation reports | ad-hoc h1, ui:4 | empty / - |
| `/violations/reports/[id]` | board/admin (layout) | Resident violation report | ad-hoc h1, ui:6 | empty / - |
| `/resident` | resident (layout) | My Home | h1 in child/none, resident screen.tsx, ui:2 | - / - |
| `/resident/account` | resident (layout) | Account | h1 in child/none, resident screen.tsx, ui:1 | - / NO-ERR |
| `/resident/announcements` | resident (layout) | Announcements | h1 in child/none, resident screen.tsx, ui:1 | empty / NO-ERR |
| `/resident/arc` | resident (layout) | My ARC applications | h1 in child/none, resident screen.tsx, ui:2 | empty / - |
| `/resident/arc/[id]` | resident (layout) | ARC application | PageHeader, resident screen.tsx, ui:7 | empty / - |
| `/resident/arc/new` | resident (layout) | New ARC application | PageHeader, resident screen.tsx, ui:7 | - / - |
| `/resident/ask` | resident (layout) | Ask the Docs | PageHeader, resident screen.tsx, ui:1 | - / - |
| `/resident/dues` | resident (layout) | Dues | h1 in child/none, resident screen.tsx, ui:1 | - / - |
| `/resident/report-violation` | resident (layout) | Report a concern | PageHeader, resident screen.tsx, ui:7 | - / - |
| `/resident/requests` | resident (layout) | Requests | h1 in child/none, resident screen.tsx, ui:1 | - / - |
| `/resident/tickets` | resident (layout) | My Tickets | h1 in child/none, resident screen.tsx, ui:2 | empty / - |
| `/resident/tickets/[id]` | resident (layout) | Ticket | PageHeader, resident screen.tsx, ui:7 | empty / - |
| `/resident/tickets/new` | resident (layout) | New Ticket | PageHeader, resident screen.tsx, ui:6 | - / - |
| `/resident/violations` | resident (layout) | My reported concerns | h1 in child/none, resident screen.tsx, ui:2 | - / - |
| `/resident/violations/[id]` | resident (layout) | Reported concern | PageHeader, resident screen.tsx, ui:7 | empty / - |
| `/admin` | platform admin (layout) | Platform overview | ad-hoc h1, ui:4 | empty / - |
| `/admin/admins` | platform admin (layout) + requirePlatformAdmin | Platform admins | ad-hoc h1, ui:5 | - / NO-ERR |
| `/admin/analytics` | platform admin (layout) | Platform analytics | ad-hoc h1, ui:4 | empty / - |
| `/admin/audit` | platform admin (layout) | Audit log | ad-hoc h1, ui:3 | empty / - |
| `/admin/import-units` | platform admin (layout) | Import properties & residents | ad-hoc h1, ui:5 | - / - |
| `/admin/tenants` | platform admin (layout) | Tenants | ad-hoc h1, ui:5 | empty / - / table |
| `/admin/tenants/[id]` | platform admin (layout) | Tenant | ad-hoc h1, ui:6 | - / - |
| `/admin/tenants/[id]/edit` | platform admin (layout) | Edit tenant | ad-hoc h1, ui:4 | - / - |
| `/admin/tenants/[id]/preview` | platform admin (layout) | Tenant preview | ad-hoc h1, ui:3 | empty / - |
| `/admin/tenants/new` | platform admin (layout) | New tenant | ad-hoc h1, ui:4 | - / - |
| `/onboarding` | signed-in (middleware) | Create your HOA | ad-hoc h1, ui:2 | - / - |
| `/onboarding/setup` | signed-in (middleware) + requireBoardOrAdmin | Finish setting up | ad-hoc h1, ui:1 | empty / err |
| `/forgot-password` | public | Reset password | h1 in child/none, no ui pkg | - / - |
| `/login` | public | Sign in | h1 in child/none, ui:1 | - / - |
| `/reset-password` | public | Set a new password | h1 in child/none, no ui pkg | - / - |
| `/signup` | public | Create account | h1 in child/none, no ui pkg | - / - |
| `/verify` | public | Check your email | h1 in child/none, no ui pkg | - / - |
| `/offline` | signed-in (middleware) | Offline | ad-hoc h1, no ui pkg | - / - |
| `/rfp-bid/[token]` | public (token) | Submit your bid | ad-hoc h1, ui:5 | - / err |
| `/rfp-bid/[token]/submitted` | public (token) | Bid received | h1 in child/none, ui:4 | - / - |
| `/vendor-onboard/[token]` | public (token) | Vendor onboarding | ad-hoc h1, ui:5 | - / err |
| `/vendor-onboard/[token]/submitted` | public (token) | Submission received | h1 in child/none, ui:4 | - / - |

#### apps/pm — 9 pages

| Route | Gate | Purpose | Header / primitives | States (empty / error / table) |
|---|---|---|---|---|
| `/` | signed-in + org (layout) | Dashboard | ad-hoc h1, ui:7 | empty / NO-ERR |
| `/rent` | signed-in + org (layout) | Rent | ad-hoc h1, ui:4 | empty / NO-ERR / table+pager |
| `/settings` | signed-in + org (layout) | Settings | ad-hoc h1, ui:6 | - / - |
| `/settings/billing` | signed-in + org (layout) | Billing | ad-hoc h1, ui:7 | - / NO-ERR |
| `/setup` | signed-in + org (layout) | Property | ad-hoc h1, ui:5 | - / NO-ERR |
| `/onboarding` | signed-in (middleware) | Welcome | ad-hoc h1, ui:2 | - / - |
| `/login` | public | Sign in | h1 in child/none, no ui pkg | - / - |
| `/signup` | public | Create account | h1 in child/none, no ui pkg | - / - |
| `/verify` | public | Check your email | h1 in child/none, no ui pkg | - / - |

#### apps/eviction — 9 pages

| Route | Gate | Purpose | Header / primitives | States (empty / error / table) |
|---|---|---|---|---|
| `/` | signed-in + org (layout) | Cases list (home) | ad-hoc h1, ui:4 | empty / NO-ERR |
| `/cases/[id]` | signed-in + org (layout) | Case detail / status | ad-hoc h1, ui:7 | - / err |
| `/cases/new` | signed-in + org (layout) | New case | h1 in child/none, ui:5 | - / - |
| `/settings` | signed-in + org (layout) | Settings | ad-hoc h1, ui:6 | - / - |
| `/settings/billing` | signed-in + org (layout) | Billing | ad-hoc h1, ui:8 | - / NO-ERR |
| `/onboarding` | signed-in (middleware) | Create workspace | ad-hoc h1, ui:2 | - / - |
| `/login` | public | Sign in | h1 in child/none, no ui pkg | - / - |
| `/signup` | public | Create account | h1 in child/none, no ui pkg | - / - |
| `/verify` | public | Check your email | h1 in child/none, no ui pkg | - / - |

#### apps/marketing — 19 pages

| Route | Gate | Purpose | Header / primitives | States (empty / error / table) |
|---|---|---|---|---|
| `/` | public | Home / landing | marketing site kit |  |
| `/about` | public | About — AI for the people who run residential property | marketing site kit |  |
| `/blog` | public | Blog | marketing site kit |  |
| `/case-studies` | public | Case studies | marketing site kit |  |
| `/case-studies/madison-park` | public | Madison Park HOA — Case study | marketing site kit |  |
| `/compare` | public | Ledger vs management companies, Vantaca, and DIY | marketing site kit |  |
| `/demo` | public | Book a demo — 10 minutes for your board | marketing site kit |  |
| `/docs` | public | Docs | marketing site kit |  |
| `/dpa` | public | Data Processing Agreement | marketing site kit |  |
| `/eviction` | public | Eviction Hub — Guided, attorney-reviewed | marketing site kit |  |
| `/hoa` | public | HOA Hub — AI for volunteer boards | marketing site kit |  |
| `/honesty-bars` | public | AI honesty bars — What Bar A, B, and C mean | marketing site kit |  |
| `/landlords` | public | PM Hub — For small landlords | marketing site kit |  |
| `/pricing` | public | Pricing — $4.99 per door, $200/mo minimum | marketing site kit |  |
| `/privacy` | public | Privacy policy | marketing site kit |  |
| `/roadmap` | public | Roadmap — Every workflow, every bar, in public | marketing site kit |  |
| `/security` | public | Security — How we protect your data | marketing site kit |  |
| `/status` | public | Status | marketing site kit |  |
| `/terms` | public | Terms of service | marketing site kit |  |
