# Design system v2 — foundation for the app-wide restyle

**Date:** 2026-10-15 · **Branch:** `claude/ui-foundation` (from `claude/quality-oracle`) · **Status:** shipped foundation; pages restyled by area agents next
**Builds on:** `docs/specs/2026-10-15-enterprise-ux-plan.md` (audit, phase-1 primitives, ratchet). That plan said "no typography or dark-mode work"; this spec supersedes that line — the owner asked for the visual bar to be raised.

Reference bar: Linear, Stripe Dashboard, Vercel, Notion — calm, dense-but-readable, consistent. Every decision below was made here; none is pending.

---

## 1. Principles

1. **Calm by default.** Neutral canvas, white cards with hairline borders, no shadow at rest. Colour is spent on meaning (brand action, status), never decoration.
2. **One way to do each thing.** One button set, one status vocabulary, one table, one page header. If a page needs something the kit lacks, add it to `packages/ui` — don't hand-roll it in the page.
3. **Truth before polish.** Failed ≠ empty ≠ loading (phase-1 rules stand). A KPI whose source failed shows "—" and "Couldn't load", never `$0`.
4. **Accessible is not optional.** WCAG 2.2 AA for every token pair (unit-tested), status never colour-only, every control labelled, keyboard reachable, focus visible, reduced motion honoured.
5. **Readable for the actual users.** Board members skew older (DESIGN_STRATEGY §6, "Linda, 58"): 16px root, 15px UI text, 40px touch targets on phones.
6. **Server-first.** Components render on the server unless they need state. Sorting and paging are URL concerns.

## 2. Brand decision

- **Indigo is the brand.** HOA Hub, marketing and the product family use indigo-600 `#4F46E5` (light) / `#8F95FA` (dark). `packages/ui/src/tokens.ts` used to document teal `#00C9A7` while the app shipped indigo; tokens.ts is now the single source the CSS is generated from, so code and docs cannot disagree again (a test pins `#4F46E5`).
- **Hub tints.** PM Hub keeps blue (`#1F5FD6`), Eviction Hub keeps violet (`#6D3FE0`) — *only* `primary*` + `ring` change per hub, so a user working in two hubs can tell them apart. Neutrals, status colours, type, spacing, components are identical. The old pm blue `#3B82F6` and eviction violet `#8B5CF6` failed white-text contrast and were darkened.
- **Amber is the AI accent** (`accent`, `Badge variant="ai"`, `StatusPill tone="ai"`), not a status.

## 3. Tokens

Source: `packages/ui/src/tokens.ts`. Wiring: `packages/ui/tailwind.config.ts` → `createTailwindConfig(hub)`, whose plugin emits `:root` (light) and `:root.dark` (dark) CSS variables as HSL channels. Every app's `tailwind.config.ts` is `createTailwindConfig('<hub>')` + its own `content`. **Apps must not declare colour variables in globals.css.** Marketing uses the preset for colour/shadow/motion but keeps Tailwind's default type scale and its larger radii (brochure brief).

### Colour roles (Tailwind names)

| Role | Class | Use |
|---|---|---|
| canvas | `bg-background` | page background |
| surface | `bg-surface` (`bg-card`) | cards, sidebar, table body |
| elevated | `bg-elevated` | menus, popovers, dialogs, toasts |
| subtle | `bg-subtle` | hover fill, table header, wells, inactive chips |
| border | `border-border`, `border-border-strong` | hairlines; stronger for emphasis/hover |
| input | `border-input` | form-control boundary — ≥3:1 vs surface (WCAG 1.4.11) |
| ring | `ring-ring` | focus ring, ≥3:1 vs canvas and surface |
| text | `text-foreground`, `text-foreground-secondary`, `text-muted` | primary / body-under-heading / meta. **All three are AA on every surface** |
| brand | `bg-primary text-primary-fg`, `hover:bg-primary-hover`, `bg-primary-subtle text-primary`, `text-primary` (links) | CTAs, active nav, links |
| status | `text-{success,warning,danger,info}`, `bg-{tone}-subtle`, `bg-{tone}-solid text-on-solid` | tone text is AA on every surface **and** on its own subtle bg |
| AI | `bg-accent-subtle text-accent-fg`, `bg-accent` (decorative) | AI affordances only |
| legacy | `text-destructive`, `bg-destructive/10` | alias of `danger`; keep working, prefer `danger` in new code |

Dark mode: `.dark` on `<html>` (HOA only — pm/eviction ship light). The pre-paint script is `THEME_INIT_SCRIPT` (`packages/ui/src/lib/theme-script.ts`), which also restores a collapsed sidebar without a flash. Theme is chosen in the top-bar user menu or the ⌘K palette (`useTheme()`).

**Contrast test:** `packages/ui/src/tokens.test.ts` — every pair in `CONTRAST_PAIRS` × 3 hubs × 2 modes (≈330 assertions), measured on the emitted HSL values. Adding a token means adding its pairs.

### Type

Inter via `next/font` (already loaded; no new font cost), with the "UI Inter" alternates (`cv02 cv03 cv04 cv11`). **Root is 16px in every app** (HOA was 18px, which inflated every spacing value by 12.5%; the text scale below compensates).

| Class | Size / line | Use |
|---|---|---|
| `text-2xs` | 11/16 | overlines only |
| `text-xs` | 13/18 | meta, captions, hints, badges, table headers |
| `text-sm` | **15/22** | default UI text: tables, controls, card copy (Tailwind default is 14) |
| `text-base` | 16/24 | reading text |
| `text-lg` | 18/26 semibold | section titles (h2) |
| `text-2xl` | 24/32 semibold, −1.5% tracking | page title (h1 — rendered by `PageHeader` only) |
| `text-3xl` | 30/36 semibold | KPI values |

Money and counts: **`num`** utility (tabular + lining figures). DataTable numeric columns, Kpi, Pager apply it for you. Do not use `font-mono` for money.

### Space, radius, elevation, motion

- **Spacing:** Tailwind's 4px scale. Use 1, 1.5, 2, 3, 4, 5, 6, 8, 12. Card padding `p-5`; page sections `space-y-6`; form fields `space-y-4`; inline groups `gap-2`.
- **Radius:** `rounded-md` 6 (small controls), `rounded-lg` 8 (buttons, inputs, nav items), `rounded-xl` 12 (cards, dialogs, menus), `rounded-full` (pills, avatars). Nothing else.
- **Elevation:** `shadow-xs` (buttons/inputs), `shadow-md` (hovered interactive card), `shadow-lg` (menus/popovers/toasts), `shadow-xl` (dialogs/sheets). Cards at rest have **no** shadow. Dark mode shadows add a hairline top highlight.
- **Motion:** `duration-fast` 120ms (hover/press), `duration-base` 180ms, `duration-slow` 260ms (sheets/drawer); `ease-standard`, `ease-emphasized` (enter), `ease-exit`. Animations: `animate-fade-in`, `animate-scale-in` (popovers/dialogs), `animate-slide-up` (bottom sheets, toasts), `animate-slide-in-right`. **Every animation and transition is neutralised under `prefers-reduced-motion`** by a global rule in the preset.
- **Z-index:** `z-20` top bar, `z-30/40/50` sidebar/drawer, `z-overlay 50`, `z-modal 60`, `z-popover 70` (menus/selects/tooltips, so they work inside dialogs), `z-toast 80`.

## 4. Component inventory and usage rules

All from `@homeowner-portal/ui`. Props of pre-existing components are backward compatible; pages improved without edits.

### Page structure
- **`Page`** — the container for every board/admin/pm/eviction page. `width`: `narrow` (forms, reading; 3xl) · `default` (lists; 5xl) · `wide` (dashboards, wide tables; 7xl). Props: `title`, `description`, `eyebrow`, `meta` (inline StatusPill/count), `actions`, `breadcrumbs` *or* `back`, `tabs`, `linkAs`. Renders the page's **only** `<h1>` via PageHeader.
- **`PageHeader`** — use directly only in full-height layouts that can't use `Page` (inbox, properties split pane). Actions: at most **one** primary button, placed last; other actions `secondary`/`ghost` or in a `⋯` DropdownMenu.
- **`Breadcrumbs`** — for depth ≥2 (`Accounting › Invoices › INV-104`). Use `back` for a simple one-level return. Never both.
- **`Tabs`** — URL sub-pages (each tab is a link). **`TabGroup/TabList/Tab/TabPanel`** — panels on one page (Radix, arrow keys). `TabGroup variant="segmented"` for 2–4 view toggles.
- **`Card`** (`CardHeader actions=…`, `CardTitle as="h2"` when directly under the h1, `CardDescription`, `CardContent`, `CardFooter` with a top border for actions). Variants: `default`, `interactive` (whole card clickable), `elevated`, `subtle`, `ghost`.

### Actions
- **`Button`** variants: `default`/`primary`, `secondary` (= `outline`), `ghost`, `subtle`, `destructive`, `destructive-ghost`, `link`. Sizes: `xs` 28, `sm` 32, `md` 36 (default), `lg` 44 (touch-first CTAs), `icon`, `icon-sm`, `icon-xs`. Icons via `icon`/`iconRight` props — never as loose children. `loading` shows a spinner and disables. Icon-only buttons need `aria-label` (+ `Tooltip`).
- **`DropdownMenu`** + `DropdownMenuItem icon shortcut destructive`. Row actions = `Button variant="ghost" size="icon-sm"` with `MoreHorizontal`.
- **`ConfirmDialog`** (declarative, async `onConfirm` keeps it open with a spinner) or **`useConfirm()`** (imperative, inside `ConfirmProvider`). `destructive` focuses Cancel first. **`window.confirm` is banned** (ratchet rule 6).

### Forms
- **Every field is a `Field`**: `<Field label hint error required|optional><Input …/></Field>`. It wires `id`/`htmlFor`, `aria-describedby` (hint + error) and `aria-invalid`. Works with `Input`, `Textarea`, `Select`, raw `<input>/<select>/<textarea>`, or a render prop `{(p) => <X {...p} />}`.
- Errors are **per field** (`error=` from the server action's `fieldErrors`); toasts are for success and non-field failures only.
- `Input` (`prefix`/`suffix` for `$`, icons, units; numeric inputs get tabular figures), `Textarea` (counter only with `maxLength`), `Select` (Radix, native-`<option>` children, hidden input for forms).
- **`Checkbox`, `Radio`, `Switch`** — native inputs with `label` + `description`. Group them with `Fieldset legend hint error` + `ChoiceGroup`. `Switch` = takes effect immediately; in a submitted form use `Checkbox`.
- Controls are 40px/16px text on phones (no iOS zoom), 36px/15px from `sm`.

### Data display
- **`DataTable`** for every table. Numeric columns `numeric` (right-aligned, tabular). Sorting: pass `sort` + `sortHref(key, dir)`, mark columns `sortable` (renders links + `aria-sort`; the query sorts). `density="compact"` for ledgers. `mobile="cards"` for lists people read on phones (each row becomes a labelled card; `mobilePrimary` picks the title, `hideOnMobile` drops columns), default `scroll` for wide financial grids (with `stickyFirstColumn`). `hideBelowLg` for secondary columns. `empty` slot takes an `EmptyState variant="compact"`; `footer` slot takes the `Pager`. Header stays sticky inside `maxHeight`. **`TableScroll`** only for tables too irregular for DataTable.
- **Status:** `StatusPill tone label` or `StatusBadge status tones labels` — icon + text always. Tones: `success`, `warning`, `danger`, `info`, `neutral`, `ai`, `brand`. Plain `Badge` is for non-status labels (counts, categories).
- **`Kpi`** for metric tiles: `label`, `value`, `delta {value, direction, sentiment, label}`, `hint`, `href`/`linkAs`, `state="loading"|"failed"`. `StatCard` remains for the older dashboard tiles.
- **`KeyValue` / `KeyValueList`** for detail-page facts. **`Avatar name src size shape`** (deterministic colour; `shape="square"` for orgs).

### Feedback
- **`Alert`** — persistent inline message (`info`, `success`, `warning`, `error`; optional `actions`). **`LoadFailed`** — a failed read; never render `EmptyState` for a failure.
- **`EmptyState`** — genuinely empty: icon, title, one sentence, one primary action (`secondaryAction` for a help link). Variants `dashed` (standalone), `plain` (inside a Card), `compact` (table body/panel).
- **`Skeleton`, `SkeletonText`, `PageSkeleton`** — loading. Routes use `loading.tsx` with `PageSkeleton`.
- **`useToast()`** — `{ tone: success|error|info|warning, message, title?, action? }`. Errors stay 8s; hover/focus pauses.
- **`Tooltip`** — ≤60 chars, never the only place information lives (touch can't hover).

### Overlays
- **`Dialog` + `DialogContent title description size footer`** — short focused task. Becomes a bottom sheet on phones automatically. Primary action last in `footer`.
- **`Sheet` + `SheetContent side width`** — longer form or record preview over a list.
- Both are Radix: focus trap, Esc, focus return, inert background. A `title` is mandatory (accessible name).

### Shell
- **`AppShell`** (`linkAs`), **`AppShellSidebar collapsible`**, `SidebarBrand logo` (org switcher goes in children), `SidebarNav` → `SidebarSection label` → **`NavItem icon label active badge linkAs`**, `SidebarFooter` (+ `SidebarCollapseToggle`), `AppShellHeader` (+ `AppShellSearchTrigger`, `UserMenu`), `AppShellContent`.
- Collapsible rail: desktop only, persisted in localStorage, restored pre-paint, ⌘\ toggles; labels become tooltips. Only enable `collapsible` when every entry is a `NavItem`.
- Mobile drawer: closes on any link click (phase-1 fix kept), Esc, backdrop tap; locks body scroll; moves focus in.
- **`CommandPalette commands onNavigate`** (cmdk) — ⌘K / Ctrl+K / `/`. HOA wires every sidebar destination, quick-create routes, theme and sign-out (`apps/hoa/src/components/layout/HoaChrome.tsx`, nav source of truth `nav.ts` shared with the sidebar).
- **Resident portal** keeps its mobile-first top bar + tab bar + `screen.tsx` kit (plan decision 2) but now uses the v2 tokens (IconTile tones map to `success/warning/danger-subtle`).

## 5. Do / don't

| Do | Don't |
|---|---|
| `text-muted` for secondary text | `text-gray-500`, `text-slate-*`, `opacity-60` on text |
| `bg-success-subtle text-success` / `StatusPill` | `bg-emerald-100 text-emerald-800` (doesn't theme, unchecked contrast) |
| `<Page title actions>` | hand-rolled `<h1 className="text-2xl font-bold">` |
| `<Field label error><Input/></Field>` | `<label>` without `htmlFor`; placeholder as the only label |
| one `Button` primary per view | two indigo buttons side by side |
| `DataTable` with `numeric` | `<table>` with `font-mono` money |
| `ConfirmDialog` / `useConfirm` | `window.confirm` |
| `LoadFailed` on a failed read | `EmptyState` when the query errored |
| `num` on figures | `font-mono` for amounts |
| `Dialog`/`Sheet` from the kit | a fixed-position div with a z-index |
| semantic tokens everywhere | arbitrary hex/HSL in a className |

## 6. Rules for the area agents (restyling pages)

1. **Wrap every board/admin/pm/eviction page in `Page`** with one of the three widths; delete the page's own `<h1>`, back link and `max-w-*` wrapper. Use `breadcrumbs` for depth ≥2.
2. **Replace hard-coded palette classes** (`bg-emerald-50`, `text-amber-800`, `bg-white`, `text-gray-*`, `dark:*` pairs) with tokens from §3. A page should need **zero** `dark:` variants.
3. **Every `<table>` → `DataTable`** (or `TableScroll` if irregular). Money columns `numeric`. Lists people open on phones get `mobile="cards"`.
4. **Every status → `StatusBadge`/`StatusPill`.** Move per-file `*_TONES/*_LABELS` maps toward one module per domain (UX plan's `STATUS` registry).
5. **Every form field → `Field`**; server actions return `fieldErrors`; no `<label>` without `htmlFor`.
6. **Buttons:** one primary per view; icons via `icon`; `size="sm"` in tables/cards, `md` in page headers and forms.
7. **Empty / failed / loading** stay truthful (phase-1 rules + ratchet). Use `EmptyState variant` appropriate to the container.
8. **Card headings:** `CardTitle as="h2"` when it's a top-level section under the page h1.
9. **No new runtime dependencies** without adding them to `packages/ui` and this spec. If a pattern repeats on 3+ pages, promote it to `packages/ui`.
10. **Verify visually** with `pnpm ui:shots --only=<route>` and **look at** the 375 and 1440 PNGs, light and dark, before claiming done. Gates: `pnpm typecheck`, `pnpm typecheck:integration`, `pnpm test:unit`, `rtk pnpm build` (never trust rtk's tsc summary line — CLAUDE.md §1–2).
11. Keep `apps/hoa/src/ux-ratchet.test.ts` green; allowlists only shrink.

## 7. Visual verification harness

There is no human browser (owner uses Safari; no extension). `pnpm ui:shots` (`scripts/ui-shots.ts`):

1. Seeds a throwaway admin (`ui-shots-admin@example.test`, reserved TLD) + "Demo Court HOA" into the **local** Supabase only (refuses non-loopback), and makes it a platform admin.
2. Starts `next dev` for `apps/hoa` on :3100 against local Supabase with `DEV_AUTOLOGIN` for that user (or reuses `UI_SHOTS_URL`).
3. Screenshots each route at 375 and 1440, light and dark (reduced motion, Next dev badge hidden) into `.ui-shots/` (gitignored): the dev-only gallery `/ui-gallery` (plus `?overlay=dialog|sheet|confirm|palette|menu|toast`, and the collapsed rail), and real routes `/`, `/violations`, `/dues`, `/properties`, `/meetings`, `/tickets`, `/communications`, `/accounting`, `/vendors`, `/settings/members`, `/admin`, `/resident`, `/resident/dues` (resident via the admin role-override cookie).

Flags: `--only=<substr>`, `--gallery-only`; `UI_SHOTS_BROWSER=webkit` for the Safari engine (`npx playwright install webkit` once). If seeding fails the gallery still runs. Logs ids/counts only.

`/ui-gallery` (`apps/hoa/src/app/(dev)/ui-gallery`) renders every component in every state inside a demo AppShell, with invented copy only. It `notFound()`s in production builds and is public only when `NODE_ENV !== 'production'` (middleware).

## 8. Decision log

1. **Tokens generated from TS, not hand-written CSS.** One file feeds the CSS, the Tailwind names and the contrast test, so they cannot drift (the teal/indigo bug was exactly that drift).
2. **HSL channels kept** (`--primary: 243 75% 59%`) so existing `hsl(var(--primary) / x)` CSS and Tailwind opacity modifiers keep working.
3. **Dark primary is light with dark text** (`#8F95FA` + near-black), so `text-primary` links stay AA on dark surfaces and the same token serves fills and links.
4. **Status `tone` vs `tone-solid`:** text-safe tone colours are lighter in dark mode; solid fills keep white text in both modes. `bg-destructive` (legacy) now means the text-safe tone — the two `bg-destructive text-white` sites were moved to `bg-danger-solid text-on-solid`.
5. **Input borders are 3:1** (`border-input`, WCAG 1.4.11) — heavier than Stripe's, chosen for this audience; decorative borders stay light.
6. **Root 16px everywhere, `text-sm` = 15px.** Normalises spacing (HOA's 18px root made every padding 12.5% larger than designed) while keeping UI text near the old effective 15.75px.
7. **Native checkbox/radio/switch** rather than Radix — no JS, native form submission, no new deps.
8. **cmdk** added to `packages/ui` for the palette (already in the lockfile via apps/hoa; no new package).
9. **Toast kept custom** (not Radix Toast) — the API is used in 23 files; it gained tone/title/action/pause rather than a rewrite.
10. **Collapsible rail is opt-in per sidebar** (`collapsible`) via the `in-rail:` variant scoped to `[data-collapsible]`, so platform-admin (same origin, same localStorage) is unaffected.
11. **pm/eviction stay light-only** for now: their pages still contain hard-coded palette classes; flipping dark on would expose them. The tokens support it; enable after their area pass.
12. **Marketing** takes colours/shadows/motion from the preset but keeps default Tailwind type and its 14–30px radii.
13. **Ratchet tightened:** rule 6 bans `window.confirm` in all app source (the three survivors were migrated to `useConfirm`).
