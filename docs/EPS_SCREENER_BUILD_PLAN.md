# Fundamental EPS Screener — Build Plan (v0.3, repo-aligned, free app)

> **What changed from v0.1:** the original draft targeted a greenfield Next.js +
> Vercel-Cron + Recharts app. This version re-bases the plan onto the patterns
> this monorepo *already* runs so the screener ships as a first-class hub next to
> HOA / PM / Eviction — same shell, same tokens, same job runner, same migration
> conventions. The methodology and formulas (§2) are unchanged; the stack,
> architecture, and UX are now "the same hi UX pattern as the HOA system."
>
> **v0.3 scope change (per owner):** this is a **free app** — **no billing, no
> auth, no RLS, no multi-tenancy.** A single shared watchlist. Any number of
> tickers can be added; NVDA is only the verification fixture. Writes go through
> the service-role client (the `/api/ingest` route + the Inngest cron); reads are
> server-side. RLS is intentionally **not** enabled on the `screener_*` tables.
>
> Open decisions from v0.1 §9 are **resolved** in §10 and recorded in
> `docs/decisions/006-eps-screener.md`.
>
> **Status: IMPLEMENTED.** `apps/screener`, `packages/market-data`, migrations
> `0026`/`0027`, the Inngest cron, and `scripts/test-screener-signals.ts` are in
> the tree. `next build` + `tsc` are green; the signals engine reproduces the
> deck's NVDA numbers (`pnpm test:screener`).

---

## 0. The one-paragraph summary

A new app, **`apps/screener`** ("Equity Screener Hub"), reuses
`@homeowner-portal/ui`. A single shared **watchlist** of tickers (free app — no
auth/RLS). An **Inngest** weekly cron (plus a "Refresh now" button) pulls
quarterly EPS (12 actual + 1–2 estimate), valuation, and 5-year annual
financials through a pluggable **`packages/market-data`** provider adapter (FMP
first, deterministic mock fallback), upserts them idempotently into Supabase via
the service-role client, and the five methodology signals are computed by a
shared pure engine (`src/lib/signals.ts`) on read. The dashboard is a sortable
scorecard table of colored signal chips; the ticker page is an ECharts
EPS-trend chart + QoQ-delta bars + the 5-step scorecard. Add any symbol from the
"Add ticker" box.

---

## 1. What it does (v1 scope) — unchanged

For a user-maintained **watchlist** of tickers, on a schedule:

1. Pull the **last 12 quarters of actual EPS** + the next 1–2 quarters of **estimated EPS**.
2. Pull current **price, trailing P/E, forward P/E, TTM margins**.
3. Compute and store the methodology's signals.
4. Show a dashboard: per-ticker scorecard + EPS trend chart.
5. Re-run each quarter as new earnings land, extending the trend line indefinitely.

Out of scope for v1: full-universe screening, backtesting, alerts/notifications.

---

## 2. The methodology → exact formulas — unchanged from v0.1

All EPS values are **quarterly actuals** unless noted. `Q` = most recent reported
quarter; `Q-4` = same quarter one year earlier; `Q-1` = prior quarter.

**Step 1 — P/E reasonableness**
```
pe_in_band      = 20 <= trailing_pe <= 30
pe_premium_flag = trailing_pe > 30      # only "justified" if growth is high (see step 3/5)
```

**Step 2 — Trend of fundamentals (5 yr)**
```
revenue_growing    = revenue[y] strictly increasing over last 5 fiscal years
net_income_growing = net_income[y] strictly increasing over last 5 fiscal years
net_margin_ttm     = stored as-is (want high)
```

**Step 3 — YoY EPS growth (backward)** — the core signal
```
yoy_growth_ratio = eps[Q] / eps[Q-4]
yoy_growth_pct   = (yoy_growth_ratio - 1) * 100
# NVDA: 1.87 / 0.81 = 2.31  ->  +131%
```

**Step 4 — QoQ EPS delta trend (accel / decel)**
```
qoq_delta[i]   = eps[i] - eps[i-1]
trend_slope    = linear-regression slope of qoq_delta over last N quarters (N=4 to start)
trend_label    = accelerating | flat | decelerating
# NVDA deltas: +0.23, +0.26, +0.32, +0.25, +0.09  -> decelerating
```

**Step 5 — Forward growth via P/E ratio**
```
fwd_growth_ratio = trailing_pe / forward_pe      # CONFIRMED trailing ÷ forward (see §10.1)
fwd_growth_pct   = (fwd_growth_ratio - 1) * 100
fwd_annual_eps   = price / forward_pe
# NVDA: 32.56 / 24.27 = 1.34  ->  +34%;  213.4 / 24.27 = 8.79 fwd annual EPS
```

### Edge cases the naive formulas miss (must handle)

- **Prior-year EPS ≤ 0** → detect sign change, return labeled `turnaround` / `n/a`, never a misleading ratio.
- **Fiscal vs calendar quarters** → align on provider `fiscal_period`, never report date.
- **Split adjustment** → confirm provider returns split-adjusted EPS (FMP does); else normalize.
- **TTM consistency** → keep `trailing_pe` and quarterly EPS same source/as-of.
- **Missing forward_pe** → step 5 returns `n/a`; scorecard degrades gracefully.

These are unit-tested with a `tsx` script (§8, mirrors `scripts/test-*.ts`).

---

## 3. Data source — FMP via an adapter package

Decision unchanged from v0.1's recommendation, but the adapter now lives in its
**own workspace package** so it mirrors `packages/ai`, `packages/billing`, and is
importable by both the app and `packages/jobs` (the Inngest cron). This is the
same boundary the repo already draws between "integration SDK wrapper" and "app."

```
packages/market-data/
├── src/index.ts                 # exports the interface + provider factory
├── src/provider.ts              # DataProvider interface + types (EpsRow, ValuationSnapshot, AnnualRow)
├── src/providers/fmp.ts         # FMP implementation (env: MARKET_DATA_FMP_API_KEY)
└── src/providers/mock.ts        # deterministic fixture provider for tests / offline dev
```

```ts
export interface DataProvider {
  getQuarterlyEps(symbol: string, quarters: number): Promise<EpsRow[]>;   // actual + estimate
  getValuation(symbol: string): Promise<ValuationSnapshot>;               // price, trailing/fwd PE, margins
  getAnnualFinancials(symbol: string, years: number): Promise<AnnualRow[]>;
}

export function getProvider(): DataProvider { /* reads MARKET_DATA_PROVIDER env, defaults 'fmp' */ }
```

| Option | EPS act+est | Forward P/E | Runtime fit | Cost | Notes |
|---|---|---|---|---|---|
| **FMP** (chosen) | yes | yes (ratios) | REST/JSON, clean on Vercel Node | free tier low cap; cheap paid for headroom | single provider covers all 5 steps |
| Alpha Vantage | yes | yes | REST/JSON | 25 req/day free | low limits |
| Finnhub | yes | partial | REST/JSON | generous free | thinner estimates |
| yfinance | yes | yes | **Python only** → separate worker | free, ToS-gray | operationally annoying — deferred behind the adapter |

The adapter lets us add a fallback (Finnhub) or yfinance worker in Phase 3 without
touching the calc engine — exactly how `packages/ai` hides the LLM provider behind
a Groq bridge today (ADR-002).

Add `MARKET_DATA_*` to the `turbo.json` `build.env` allowlist alongside the
existing `AI_*` / `STRIPE_*` groups.

---

## 4. Architecture — mapped onto the existing stack

```
apps/screener  (Next.js 15 App Router, React 19, Tailwind 3 — same as apps/hoa)
├── src/app/layout.tsx                root: fonts, theme pre-paint script, <Providers> + <Shell>
├── src/app/globals.css               --screener CSS vars incl. --pos/--neg directional tokens
├── src/app/page.tsx                  dashboard: StatCards + sortable scorecard table (RSC)
├── src/app/ticker/[symbol]/page.tsx  detail: Tabs → scorecard / ECharts trend+QoQ / financials
├── src/app/api/ingest/route.ts       POST {symbol?} → pull + upsert (idempotent). Optional CRON_SECRET gate.
├── src/app/actions.ts                server actions: add / refresh / refreshAll / remove
├── src/lib/signals.ts                pure engine: peReasonableness, fundamentalsTrend, yoyGrowth, qoqTrend, fwdGrowth, buildScorecard
├── src/lib/ingest.ts                 ingestTicker / ingestAllActive (service-role upserts)
├── src/lib/queries.ts                getWatchlist / getTicker → runs the signals engine on read
└── src/lib/db.ts                     schema-less service-role Supabase client (no RLS)

packages/market-data                  provider adapter: DataProvider + FmpProvider + MockProvider — §3
packages/jobs/src/screener-refresh.ts Inngest weekly cron → POSTs the app's /api/ingest (HTTP seam)

Supabase (Postgres)
├── migrations/0026_screener.sql      screener_* tables + set_updated_at trigger (idempotent, NO RLS)
└── migrations/0027_screener_views.sql derived metrics: eps_growth / annual_trend / latest_* (LAG window fns)
```

**Why Inngest, not Vercel Cron:** the repo already runs five Inngest crons
(`packages/jobs`, app id `homeownerhub`) and ADR-001 settled "Inngest over
pg-boss/Trigger.dev." Adding a sixth function is zero new infra. The
"Refresh now" button (server action) and the cron both drive the *same*
idempotent ingest code path in `src/lib/ingest.ts`. The cron lives in
`packages/jobs`, which can't import across the app boundary, so it reaches the
logic by POSTing the app's `/api/ingest` endpoint (`SCREENER_APP_URL`) — one
seam, single-sourced ingestion.

**Ingestion is idempotent**: upsert on `(ticker_id, fiscal_period)`. Re-running
never duplicates; estimates get overwritten by actuals when earnings land
(`is_forecast` flips false).

**Derived metrics are SQL views, not stored columns** — YoY = `LAG(eps,4)`,
QoQ = `LAG(eps,1)` over `fiscal_period`. The `quarterly_eps` table is the single
source of truth for the trend line; recompute on read. This matches the repo's
existing "views over window functions" instinct (e.g. dues-aging SQL).

---

## 5. Data model (Supabase) — repo conventions applied

Conventions copied from `migrations/0024_tickets.sql`: `uuid` PKs with
`gen_random_uuid()`, `created_at/updated_at timestamptz default now()`,
`set_updated_at` BEFORE-UPDATE trigger, partial indexes, `CHECK` constraints,
idempotent `CREATE TABLE IF NOT EXISTS`. **No RLS** — free, single shared
watchlist; all writes are service-role, all reads server-side.

```sql
-- 0026_screener.sql  (idempotent, NO RLS — single shared watchlist)

CREATE TABLE IF NOT EXISTS public.screener_tickers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol      text NOT NULL,
  name        text,
  currency    text NOT NULL DEFAULT 'USD',
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (symbol)
);

CREATE TABLE IF NOT EXISTS public.screener_quarterly_eps (   -- the persistent trend line
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker_id        uuid NOT NULL REFERENCES public.screener_tickers(id) ON DELETE CASCADE,
  fiscal_period    text NOT NULL,            -- '2026Q1'
  period_end       date NOT NULL,
  eps_actual       numeric,
  eps_estimate     numeric,
  revenue_actual   numeric,
  revenue_estimate numeric,
  is_forecast      boolean NOT NULL DEFAULT false,
  source           text,
  fetched_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticker_id, fiscal_period)
);

CREATE TABLE IF NOT EXISTS public.screener_valuation_snapshots (  -- point-in-time
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker_id            uuid NOT NULL REFERENCES public.screener_tickers(id) ON DELETE CASCADE,
  as_of                date NOT NULL,
  price                numeric,
  trailing_pe          numeric,
  forward_pe           numeric,
  net_margin_ttm       numeric,
  gross_margin_ttm     numeric,
  operating_margin_ttm numeric,
  roi_ttm              numeric,
  market_cap           numeric,
  source               text,
  fetched_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticker_id, as_of)
);

CREATE TABLE IF NOT EXISTS public.screener_annual_financials (   -- step 2, 5-yr trend
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker_id   uuid NOT NULL REFERENCES public.screener_tickers(id) ON DELETE CASCADE,
  fiscal_year int NOT NULL,
  revenue     numeric,
  net_income  numeric,
  source      text,
  UNIQUE (ticker_id, fiscal_year)
);

-- Indexes + a set_updated_at trigger on screener_tickers follow exactly. No
-- RLS is enabled; all access is server-side via the service-role client.
```

**Derived views — `0027_screener_views.sql`:**
```sql
CREATE OR REPLACE VIEW public.screener_eps_growth AS
SELECT ticker_id, fiscal_period, period_end, eps_actual,
       eps_actual / NULLIF(LAG(eps_actual, 4) OVER w, 0) AS yoy_ratio,
       eps_actual - LAG(eps_actual, 1) OVER w            AS qoq_delta,
       SIGN(eps_actual) <> SIGN(LAG(eps_actual, 4) OVER w) AS yoy_sign_change  -- turnaround flag
FROM public.screener_quarterly_eps
WHERE NOT is_forecast
WINDOW w AS (PARTITION BY ticker_id ORDER BY period_end);

-- Plus screener_annual_trend (step-2 booleans), screener_latest_valuation,
-- and screener_latest_eps_growth (DISTINCT ON). QoQ slope (linear regression
-- over N quarters) is computed in src/lib/signals.ts from the eps_growth rows,
-- not in SQL, so N stays a config value (§7).
```

In practice the app reads the raw `screener_*` tables in `src/lib/queries.ts`
and runs the **same** `buildScorecard` engine the ingest path / tests use, so
the dashboard, the detail page, and `pnpm test:screener` can never disagree on
the numbers. The views above are available for ad-hoc SQL / future use.

---

## 6. UI — the HOA "hi UX" pattern, component by component

Everything below is **reused shared UI**, not new primitives. The screener
inherits dark mode, AAA contrast, the off-white→ink canvas, PWA install, and the
mobile off-canvas drawer for free.

### Shell
- `AppShell` / `AppShellSidebar` / `AppShellHeader` / `AppShellContent` — identical to `apps/hoa/(dashboard)/layout.tsx`.
- A new **`ScreenerSidebar`** built from the shared `SidebarBrand` / `SidebarNav` / `SidebarSection` / `NavItem` primitives. Nav: Dashboard, Watchlist, (Phase 3) Alerts.
- `HubSwitcher` in the header so Equity Screener slots into the same cross-hub switcher as HOA/PM/Eviction.
- `PageHeader` (`title` + `description` + `actions`) tops every page; the **"Add ticker"** input and **"Refresh now"** `Button` live in the dashboard `PageHeader.actions`.

### Dashboard (`/`)
- Sortable table, one row per watchlist ticker, each of the 5 signals rendered as a **`StatusBadge`** chip with a per-signal tone map — green = pass / accelerating, amber = flag / flat / `n/a`, red = fail / decelerating. This is literally the "colored chips" the v0.1 plan asked for, using the component HOA already uses for vendor/violation statuses.
- A row of **`StatCard`** tiles up top: # tickers, # passing all 5, # with PE premium flag, # decelerating — clickable, hover-lift, with graceful `emptyState` copy ("No tickers yet — add one to start tracking.").
- Empty watchlist → shared **`EmptyState`** with an "Add your first ticker" CTA.
- Sort by YoY growth via `@tanstack/react-table` (already an `apps/hoa` dependency).

### Ticker detail (`/ticker/[symbol]`)
- Shared **`Tabs`** strip in the page header: **Overview · EPS Trend · Financials** (same pattern HOA uses on vendors/violations/accounting).
- **EPS trend**: ECharts line chart (`echarts-for-react`, the repo's chart lib — *not* Recharts) of 12q `eps_actual`, forecast quarters rendered as a **dashed** continuation series.
- **QoQ deltas**: ECharts bar chart, bars tinted with the `--pos` / `--neg` semantic tokens (§ tokens below).
- **5-step scorecard**: a `Card` grid; each step shows the real numbers (e.g. "YoY 1.87 / 0.81 = 2.31 → **+131%**") + a `StatusBadge` verdict, using shared **`KeyValue`** rows for the numeric breakdown.
- `BackLink` to the dashboard.

### Feedback & mutations
- **`Toast`** (`useToast`) for "Refreshed NVDA" / ingest errors.
- **`Confirm`** (`useConfirm`) for "Remove ticker from watchlist" (soft delete via `deleted_at`).
- `Skeleton` + route-level `loading.tsx` for the ingest round-trip, matching `apps/hoa/admin/analytics/loading.tsx`.

### Tokens — a new `screener` hub palette
Add a `screener` entry to `packages/ui/src/tokens.ts` and wire it in
`apps/screener/src/app/globals.css` (same mechanism as HOA's globals).

> **Finance-specific UX call:** in a screener, **green = up / red = down are
> *data* colors**, so the brand/primary must NOT be green or it competes with the
> bullish signal. Primary is a neutral **slate-indigo**; we add dedicated
> semantic tokens **`--pos` (emerald)** and **`--neg` (rose)** used *only* for
> signal chips and chart deltas. Amber stays the AI-affordance accent, consistent
> with the rest of the system.

```ts
screener: {
  primary: '#4F46E5',     // slate-indigo — brand chrome, never a directional signal
  primaryFg: '#ffffff',
  accent:  '#F59E0B',     // amber — AI affordances (consistent with hoa/pm/eviction)
  pos:     '#059669',     // emerald-600 — "up / pass / accelerating" ONLY
  neg:     '#E11D48',     // rose-600 — "down / fail / decelerating" ONLY
  bg: '#FAFBFD', surface: '#ffffff', border: '#E5E7EB',
  text: '#111827', muted: '#6B7280', fontSizeBase: '16px',
}
```

---

## 7. Trend tracking — "keep calculating every new quarter"

- `screener_quarterly_eps` grows by one row per ticker per earnings release — the trend line is the full series.
- QoQ-slope window starts at **N=4**, exposed as a config constant in `src/lib/signals.ts` so it widens to 8/12 as history accumulates (no schema change).
- Optional Phase 2: persist a `screener_trend_snapshots` row each refresh (date, slope, label) to chart "how the assessment itself changed" — useful, not required for MVP.

---

## 8. Phasing

- **Phase 0 — Foundation. ✅ done.** `migrations/0026` + `0027`; `packages/market-data` with FMP + mock providers; `src/lib/signals.ts` + `src/lib/ingest.ts` + `/api/ingest`. Signals verified against the deck's NVDA numbers via `scripts/test-screener-signals.ts` (`pnpm test:screener`).
- **Phase 1 — Watchlist + dashboard. ✅ done.** `apps/screener` scaffold (shell, globals, manifest, no auth). Add/refresh/remove via server actions, all 5 signals, StatCards + sortable scorecard table, `screener` tokens, `ScreenerSidebar`, Inngest weekly cron + Refresh-now button.
- **Phase 2 — Detail + edges. ✅ done.** Ticker detail with ECharts trend/QoQ charts, full edge-case handling (turnaround/`n/a`), QoQ slope label, `Tabs`, `BackLink`.
- **Phase 3 — Hardening (future).** Alerts on signal flips, fallback/secondary provider behind the adapter, optional yfinance worker, optional Natan-engine handoff, real forward-P/E source (FMP free tier omits it — step 5 degrades to `n/a` until then).

A **`BarBGate`** review is required before any AI-flavored copy ships
(consistent with the repo's mandatory AI gate) — relevant only if Phase 3 adds an
"explain this signal" LLM blurb; the core math is deterministic and ungated.

---

## 9. What shipped (all ✅)

1. `packages/market-data` — `provider.ts` (interface), `providers/fmp.ts`, `providers/mock.ts` (NVDA fixture + synthetic fallback), `index.ts` (`getProvider()` env switch).
2. `migrations/0026_screener.sql` (tables + trigger, no RLS) + `migrations/0027_screener_views.sql` (views).
3. `apps/screener/src/lib/signals.ts` (pure engine) + `scripts/test-screener-signals.ts` + `pnpm test:screener` (green).
4. `src/lib/ingest.ts` + `src/lib/db.ts` + `src/app/api/ingest/route.ts` + `src/app/actions.ts`.
5. `apps/screener` shell (`layout.tsx`, `globals.css`, `manifest.ts`, `Shell`, `ScreenerSidebar`, `ThemeToggle`, `Providers`), `screener` tokens in `packages/ui`.
6. Dashboard (`page.tsx`: StatCards + `WatchlistTable`) + ticker detail (`ticker/[symbol]/page.tsx`: `Tabs` → `Scorecard` / ECharts `EpsTrendChart`+`QoqDeltaChart` / financials). Toast/Confirm/EmptyState/Skeleton wired.
7. `packages/jobs/src/screener-refresh.ts` Inngest weekly cron + registered in `index.ts`.
8. `MARKET_DATA_*` / `SCREENER_APP_URL` / `CRON_SECRET` in `turbo.json` build env; `dev:screener` + `test:screener` in root `package.json`.

**Verification:** `pnpm test:screener` green; `pnpm --filter screener build` green (`tsc` + Next build pass).

### Deploy / runtime config
- Set `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (server-only) for the screener app.
- Apply `migrations/0026` + `0027` to the Supabase project.
- `MARKET_DATA_PROVIDER=mock` (default with no key) for offline/demo; set `MARKET_DATA_FMP_API_KEY` + `MARKET_DATA_PROVIDER=fmp` for live data.
- For the weekly cron: set `SCREENER_APP_URL` on the deploy that hosts the Inngest functions; optionally `CRON_SECRET` (sent + enforced on `/api/ingest`).

---

## 10. Open decisions from v0.1 §9 — RESOLVED

Full rationale in `docs/decisions/006-eps-screener.md` (ADR-006).

| # | Question | Resolution | Why |
|---|---|---|---|
| 10.1 | Step 5 ratio | **trailing ÷ forward P/E** ✅ | `trailing/forward = (P/E_ttm)/(P/E_fwd) = EPS_fwd/EPS_ttm` = the consensus EPS-growth ratio. trailing÷current = 1 (useless). Confirmed. |
| 10.2 | Data provider | **FMP primary, behind the `packages/market-data` adapter** | Single provider covers all 5 steps; tiny watchlist stays in free/cheap limits; adapter defers yfinance's Python-worker cost to Phase 3. |
| 10.3 | Scorecard verdict | **Show the 5 signal chips; add a soft composite "X/5 passing" count — no hard buy/avoid label** | Matches the HOA "show signals, let the human decide" philosophy and the BarBGate no-overclaim stance. A binary verdict would imply advice we don't stand behind. |
| 10.4 | Universe | **Manual shared watchlist for v1** | Smallest surface that proves the methodology; bulk import is a Phase 3 add behind the same ingest path. Add any symbol — NVDA is only the verification fixture. |
| 10.5 | Multi-user | **None — free app, no auth/RLS, single shared watchlist** (revised per owner) | No billing, no login, no per-user scoping. Writes are service-role; reads are server-side. Org/RLS scoping can layer on later without a data migration if the product ever needs it. |
| 10.6 | Refresh cadence | **Inngest weekly cron + manual "Refresh now" button** | Earnings are quarterly, so weekly is ample; both hit the same idempotent ingest path. Event-driven (earnings-calendar) is a Phase 3 refinement. |

---

## 11. Deltas from v0.1 at a glance

| Area | v0.1 draft | v0.2 (this doc) | Reason |
|---|---|---|---|
| Job runner | Vercel Cron | **Inngest** (app `homeownerhub`) | Repo standard (ADR-001), zero new infra |
| Charts | Recharts | **ECharts** (`echarts-for-react`) | What `apps/hoa` actually ships |
| UI primitives | new build | **`@homeowner-portal/ui`** reuse | Same shell/tokens/dark-mode/PWA as HOA |
| Provider | inline adapter | **`packages/market-data`** workspace pkg | Mirrors `packages/ai` / `billing` boundary |
| Tenancy | "matches HOA pattern" (org) | **none — no auth/RLS** | Free app; single shared watchlist, service-role writes |
| Tables | `tickers`, `quarterly_eps`, … | **`screener_*` prefixed** | Single shared Postgres schema; avoid collisions |
| Signal colors | green/amber/red brand | **`--pos`/`--neg` semantic tokens**, neutral brand | Finance UX: don't let brand chrome read as a buy signal |
```
