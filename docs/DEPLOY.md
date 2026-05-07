# HomeownerHub — Deployment Guide

End-to-end recipe to ship Phase 1 to production. ~30–60 minutes of clicking once you have keys + the domain.

## What you'll deploy

Three Next.js apps, three subdomains, one Supabase project, one Inngest app, one Stripe account.

| App | Vercel project name | Production URL |
|---|---|---|
| `apps/hoa` | `homeownerhub-hoa` | `hoa.homeownerhub.com` |
| `apps/eviction` | `homeownerhub-eviction` | `evict.homeownerhub.com` |
| `apps/pm` | `homeownerhub-pm` | `pm.homeownerhub.com` |

Same Supabase project (`xwdjsxfskvreguyvryhc`) backs all three.

## Before you start

- A `homeownerhub.com` domain (or whatever — substitute throughout).
- A Vercel account with the team you want to ship under.
- Stripe in **live** mode with products + prices created (test-mode prices won't work in prod). See `STRIPE_PRICE_*` vars in each app's `.env.example`.
- RunPod vLLM pod URL + API key (or none — apps degrade gracefully). The pod runs Qwen 2.5 14B (main + reason + cloud agents) and optionally Qwen 2.5-VL 7B for the violation wizard's vision step. 100% open source models — no commercial AI vendor calls.
- Inngest account at https://app.inngest.com — generates the `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` for production.

## 1. Run all migrations on Supabase

In SQL editor (https://supabase.com/dashboard/project/xwdjsxfskvreguyvryhc/sql/new), run in order:

1. `schema.sql` — base schema (already done locally).
2. `migrations/0001_auth_fixes.sql` — `handle_new_user` search_path fix + INSERT policies.
3. `migrations/0002_wizard_drafts.sql` — `wizard_drafts` table + RLS.

Verify with:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' ORDER BY table_name;
```

You should see all 14 tables (the original 13 + `wizard_drafts`).

## 2. Configure Supabase Auth

https://supabase.com/dashboard/project/xwdjsxfskvreguyvryhc/auth/url-configuration

**Site URL:** `https://hoa.homeownerhub.com`

**Redirect URLs (add all):**
```
https://hoa.homeownerhub.com/auth/callback
https://evict.homeownerhub.com/auth/callback
https://pm.homeownerhub.com/auth/callback
http://localhost:3000/auth/callback
http://localhost:3001/auth/callback
http://localhost:3002/auth/callback
```

(Keep localhost URLs so you can still develop against the same Supabase project.)

## 3. Confirm Storage buckets

https://supabase.com/dashboard/project/xwdjsxfskvreguyvryhc/storage/buckets

All three should be **Private**:

- `hoa-documents` (CC&Rs, bylaws, rules)
- `hoa-photos` (violation photos)
- `eviction-docs` (notices)

## 4. Deploy each app to Vercel

Repeat for HOA, Eviction, PM.

### Create the project

```bash
# HOA
vercel link
# Pick: Set up and deploy "~/code/HomeOwnerHub"? → No, link to existing
# Project name: homeownerhub-hoa
# Root directory: apps/hoa
```

The trick: **Vercel needs each app's `apps/<name>` set as Root Directory**. The build command then finds the right `package.json`.

In Vercel project settings:

- **Root Directory:** `apps/hoa` (or `apps/eviction` / `apps/pm`)
- **Framework Preset:** Next.js
- **Build Command:** `cd ../.. && pnpm install --frozen-lockfile && pnpm build --filter=hoa` (substitute filter per app: `--filter=eviction`, `--filter=pm`)
- **Install Command:** `echo skip` (the build command above does the install)
- **Output Directory:** `.next`

### Set environment variables

Copy from each app's `.env.example` and fill in real values. Critical ones:

```
NEXT_PUBLIC_SUPABASE_URL=https://xwdjsxfskvreguyvryhc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<the anon key>
SUPABASE_SERVICE_ROLE_KEY=<the service role key — secret>

STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=<set later, after webhook is registered>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_PRICE_STARTER=price_...   # HOA only; substitute per app
# ... other STRIPE_PRICE_* per app

# Cloud agent (Daily Digest) now runs on the same Qwen 14B endpoint
# as the main agent — fully open source, no commercial AI vendor.
AI_MODEL_CLOUD=Qwen/Qwen2.5-14B-Instruct

# Cross-hub linking
NEXT_PUBLIC_APP_URL=https://hoa.homeownerhub.com    # this app's URL
NEXT_PUBLIC_HOA_URL=https://hoa.homeownerhub.com
NEXT_PUBLIC_EVICTION_URL=https://evict.homeownerhub.com
NEXT_PUBLIC_PM_URL=https://pm.homeownerhub.com

# Inngest (HOA only — that's where /api/inngest is mounted)
INNGEST_EVENT_KEY=<from app.inngest.com>
INNGEST_SIGNING_KEY=<from app.inngest.com>
```

### Deploy

```bash
vercel --prod
```

First deploy takes ~3 min. Subsequent deploys are ~1 min thanks to Turbo's remote cache.

## 5. Wire the custom domains

In each Vercel project → Settings → Domains:

- HOA: add `hoa.homeownerhub.com`
- Eviction: add `evict.homeownerhub.com`
- PM: add `pm.homeownerhub.com`

Vercel will give you a CNAME record. At your DNS host (Cloudflare / Namecheap / etc.):

```
hoa     CNAME  cname.vercel-dns.com
evict   CNAME  cname.vercel-dns.com
pm      CNAME  cname.vercel-dns.com
```

Wait 1–10 minutes for DNS to propagate. Vercel auto-issues a Let's Encrypt cert once it sees the CNAME.

## 6. Register Stripe webhook endpoints

For each app, register a webhook endpoint at https://dashboard.stripe.com/webhooks:

| App | Endpoint URL | Events to send |
|---|---|---|
| HOA | `https://hoa.homeownerhub.com/api/webhooks/stripe` | `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed` |
| Eviction | `https://evict.homeownerhub.com/api/webhooks/stripe` | (same three) |
| PM | `https://pm.homeownerhub.com/api/webhooks/stripe` | (same three) |

Each gives you a **Signing secret** (`whsec_...`). Paste that into `STRIPE_WEBHOOK_SECRET` in the matching Vercel project's env vars and **redeploy** so it picks up the new env.

## 7. Connect Inngest to production

At https://app.inngest.com, create a new app named `homeownerhub`.

Add a sync URL pointing at: `https://hoa.homeownerhub.com/api/inngest`

Inngest will hit that endpoint on every deploy and discover all five cron functions:

- `daily-digest` (7am ET)
- `hoa-late-fees` (midnight ET)
- `pm-late-fees` (midnight ET)
- `eviction-reminders` (8am ET)
- `wizard-draft-reminders` (8am ET)

Verify in the Inngest UI under **Functions** that all five appear. Manual invocations from the UI work for testing without waiting for the cron time.

## 8. Smoke test production

Open https://hoa.homeownerhub.com:

- [ ] Magic-link signup works (check email arrives, clicking returns to dashboard)
- [ ] Onboarding creates an HOA org
- [ ] Dashboard renders with empty stat cards (no errors in browser console)
- [ ] Hub switcher dropdown shows all three hubs

Repeat the basic auth + onboarding test for evict + pm.

## 9. Hand the URL to Madison Park

You're done with infra. Move on to **MADISON_PARK_DEMO.md** for the demo run-through.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `relation "profiles" does not exist` on signup | Run `0001_auth_fixes.sql` |
| `new row violates row-level security policy for table "orgs"` on onboarding | Run `0001_auth_fixes.sql` (it adds the INSERT policies) |
| `Invalid API key` on org creation | `SUPABASE_SERVICE_ROLE_KEY` is wrong/missing in Vercel env |
| Stripe webhook 400 errors | `STRIPE_WEBHOOK_SECRET` is from the wrong webhook (each app has its own) |
| Inngest sync fails | `INNGEST_SIGNING_KEY` env var missing on the HOA Vercel project |
| Magic link 404s after click | Redirect URL not allowlisted in Supabase auth settings |
| Hub switcher shows "Sign in to set up" for own hub | `NEXT_PUBLIC_*_URL` env vars missing or wrong |
