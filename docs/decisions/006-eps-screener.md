# 006 — Fundamental EPS Screener

**Date:** 2026-06-12
**Status:** Accepted — **implemented**
**Context:** New product — a per-user fundamental-EPS screener — to ship as a
fourth hub in the monorepo alongside HOA / PM / Eviction. Full plan in
`docs/EPS_SCREENER_BUILD_PLAN.md` (v0.2). This ADR records the decisions that
re-based the v0.1 draft onto the repo's existing conventions and resolves the
v0.1 §9 open questions.

## Decisions

| Area | Choice | Notes |
|---|---|---|
| App placement | New `apps/screener` ("Equity Screener Hub") | Reuses `@homeowner-portal/ui`; same shell/tokens as `apps/hoa` |
| Billing / auth / RLS | **None — free app** (revised per owner) | No login, no per-user scoping, no RLS on `screener_*`; single shared watchlist, service-role writes |
| Background jobs | **Inngest** weekly cron | Consistent with ADR-001 + the five existing crons in `packages/jobs`; no new infra |
| Charts | **ECharts** (`echarts-for-react`) | The lib `apps/hoa` already uses; overrides v0.1's Recharts |
| Data provider | **FMP**, behind a `packages/market-data` adapter | Single provider covers all 5 steps; adapter mirrors `packages/ai`/`billing` and defers yfinance's Python worker |
| Step 5 ratio | **trailing ÷ forward P/E** | `= EPS_fwd / EPS_ttm`, the consensus growth ratio; trailing÷current = 1 |
| Scorecard verdict | **5 signal chips + soft "X/5 passing"; no hard buy/avoid** | Matches HOA "show signals, human decides" + BarBGate no-overclaim |
| Universe | **Manual per-user watchlist** for v1 | Bulk import deferred to Phase 3 behind the same ingest path |
| Tenancy | **None — single shared watchlist, no RLS** | Free app, no auth; org/RLS scoping can layer on later without a data migration |
| Refresh cadence | **Inngest weekly cron + manual "Refresh now"** | Earnings are quarterly; both hit one idempotent ingest path |
| Migrations | `0026_screener.sql` + `0027_screener_views.sql` | Idempotent, two-policy RLS, `set_updated_at` triggers, `screener_*` table prefix |
| Derived metrics | **SQL views** (`LAG(eps,4)` YoY, `LAG(eps,1)` QoQ); QoQ slope in `src/lib/signals.ts` | Views over stored columns; quarterly table is the single source of truth |

## Finance-specific UX decision

In a screener, **green = up / red = down are data colors**. The brand/primary is
therefore a neutral slate-indigo (never directional), and dedicated semantic
tokens `--pos` (emerald) / `--neg` (rose) are reserved exclusively for signal
chips and chart deltas. Amber remains the AI-affordance accent, consistent with
the other hubs.

## Open / deferred

| Question | Resolution | Reasoning |
|---|---|---|
| Secondary / fallback provider | **Deferred to Phase 3** | Adapter makes this a drop-in; not needed at watchlist scale |
| yfinance (Python worker) | **Deferred to Phase 3** | Operationally annoying; FMP covers v1 |
| Earnings-calendar event-driven refresh | **Deferred to Phase 3** | Weekly cron is ample for quarterly earnings |
| Alerts on signal flips | **Phase 3** | Requires `screener_trend_snapshots` history first |
| Natan-engine handoff | **Phase 3** | Out of v1 scope |
| Composite buy/avoid score | **Rejected for v1** | Implies advice we don't stand behind |
