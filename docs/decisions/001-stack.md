# 001 — Stack decisions for v1

**Date:** 2026-05-09
**Status:** Accepted
**Context:** Captured per Build Spec v1.0 §2 ("Non-Negotiables") and §14 (open
questions resolved 2026-05-09).

## Decisions

| Area | Choice | Notes |
|---|---|---|
| Frontend | Next.js 15 App Router + TypeScript + Tailwind + shadcn/ui | Existing Phase 1 stack — kept |
| Backend | Next.js API routes + Supabase (Postgres + Auth + RLS + Storage) | Existing — kept |
| Database | Postgres 15+ via Supabase | Phase 2 enables `pgvector` for W1 RAG |
| Auth | Supabase Auth (email magic link + Google later) | Existing — kept |
| Background jobs | **Inngest** (managed) | Already in production with 5 cron functions; spec lists Inngest as an option, no migration cost |
| Hosting (web) | Vercel | Existing — three projects deployed |
| Payments | Stripe — direct accounts in v1; Stripe Connect deferred to month 4 (see ADR-004) | Phase 1 already has Checkout + webhooks live in test mode |
| Email (transactional) | Resend (planned) | Phase 1 still on Supabase default SMTP / optional Gmail; Resend domain verification deferred until rebrand finalized |
| SMS / Voice | Twilio (planned, month 3+) | Voice agent (W2 v1.2) — deferred |
| Document storage | Supabase Storage with signed URLs | Existing — kept |
| Monitoring | Sentry + PostHog + Supabase logs | Sentry + PostHog setup deferred to month 2 |
| LLM observability | Langfuse (self-hosted) | Setup deferred to month 2 alongside `defineWorkflow` primitive |

## Open §14 questions resolved

| Question | Resolution | Reasoning |
|---|---|---|
| Trigger.dev vs pg-boss vs Inngest | **Inngest** | Already running in production; switching costs > 0 and benefits unclear at this scale |
| Single vs dual GPU host | **Deferred** | Bridging on Groq through dev (see ADR-002) so the GPU host topology question doesn't block month 1 |
| White-label CAM domains | **Deferred to month 4** | First CAM customer hasn't signed; revisit when one does |
| ACH provider (Plaid+Stripe vs Heritage / Alliance) | **Deferred to month 3** | W6 (Assessment / Dues Engine) is when this matters; bank-only ACH not needed for the dues collection MVP |
| Design partner badge | **Deferred** | UI decision, can land alongside Madison Park's first quarter on the platform |

## Project naming

Renamed from `HomeownerHub` to **Homeowner Portal** per spec §0. Internal package
namespace is `@homeowner-portal/*`. The Inngest app ID stays `homeownerhub` to
avoid breaking the existing production sync — internal identifier, not
user-facing.

## What this changes for Phase 1

- `@homeownerhub/*` package imports → `@homeowner-portal/*` (done in
  commit `<this commit>`)
- Vercel projects, Supabase Auth Site URL, env-var URL families: rename
  is a manual user step (see `docs/DEPLOY_PHASE_C.md` updates)
- Repo rename on GitHub: deferred — GitHub redirects from old name
