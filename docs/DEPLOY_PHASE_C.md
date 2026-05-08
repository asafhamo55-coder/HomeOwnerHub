# HomeownerHub — Phase C Deploy Walkthrough

Stack-specific recipe for the live Phase 1 deploy:

- **Domain:** Vercel auto-subdomains (no custom DNS)
- **Stripe:** test mode
- **AI:** Groq free tier (Llama 3.3 70B + 3.1 8B), OpenAI-compatible
- **Inngest:** free tier
- **Supabase:** existing project `xwdjsxfskvreguyvryhc`

For the live-mode + custom-domain version, see `DEPLOY.md`.

## URL plan

| App | Vercel project | Production URL |
|---|---|---|
| `apps/hoa` | `homeowner-hub` | `https://homeowner-hub.vercel.app` |
| `apps/eviction` | `homeowner-hub-eviction` | `https://homeowner-hub-eviction.vercel.app` |
| `apps/pm` | `homeowner-hub-pm` | `https://homeowner-hub-pm.vercel.app` |

Rename freely in Vercel — just keep all three env-var sets in sync.

## Step 1 — Apply migrations to Supabase

SQL editor: https://supabase.com/dashboard/project/xwdjsxfskvreguyvryhc/sql/new

Paste and run, in order:

1. `schema.sql` (if you haven't already)
2. `migrations/0001_auth_fixes.sql`
3. `migrations/0002_wizard_drafts.sql`
4. `migrations/0003_storage_policies.sql`

Verify:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' ORDER BY table_name;
```

You should see 14 tables including `wizard_drafts`.

## Step 2 — Configure Supabase Auth redirects

https://supabase.com/dashboard/project/xwdjsxfskvreguyvryhc/auth/url-configuration

**Site URL:** `https://homeowner-hub.vercel.app`

**Redirect URLs (paste all):**

```
https://homeowner-hub.vercel.app/auth/callback
https://homeowner-hub-eviction.vercel.app/auth/callback
https://homeowner-hub-pm.vercel.app/auth/callback
http://localhost:3000/auth/callback
http://localhost:3001/auth/callback
http://localhost:3002/auth/callback
```

## Step 3 — Get a Groq API key

1. Sign up at https://console.groq.com (Google login is fastest)
2. Create API key at https://console.groq.com/keys → name it `homeownerhub`
3. Copy the `gsk_...` key — you'll paste it into all three Vercel projects

Free tier: 30 requests/min, 14,400 requests/day. Plenty for a demo.

## Step 4 — Get Stripe test-mode keys + create products

Toggle to **Test mode** (top-right of Stripe dashboard).

### Keys

https://dashboard.stripe.com/test/apikeys

- `pk_test_...` → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `sk_test_...` → `STRIPE_SECRET_KEY`

### Products + prices

https://dashboard.stripe.com/test/products → "Add product" for each row below. After creating each price, copy the `price_...` ID.

| Product | Price | Var |
|---|---|---|
| HOA Starter | $49/mo recurring | `STRIPE_PRICE_STARTER` |
| HOA Standard | $99/mo recurring | `STRIPE_PRICE_STANDARD` |
| HOA Pro | $199/mo recurring | `STRIPE_PRICE_PRO` |
| Eviction per-case | $249 one-time | `STRIPE_PRICE_PER_CASE` |
| Eviction Unlimited | $99/mo recurring | `STRIPE_PRICE_UNLIMITED` |
| PM Investor | $15/mo recurring | `STRIPE_PRICE_PM_INVESTOR` |
| PM Pro | $29/mo recurring | `STRIPE_PRICE_PM_PRO` |

## Step 5 — Create the Inngest production app

1. Sign up at https://app.inngest.com
2. Create a new app, name it `homeownerhub`, environment `production`
3. Settings → Event Keys → copy `INNGEST_EVENT_KEY`
4. Settings → Signing Key → copy `INNGEST_SIGNING_KEY`

(You'll add the sync URL after the HOA app is deployed in Step 7.)

## Step 6 — Get the Supabase service-role key

https://supabase.com/dashboard/project/xwdjsxfskvreguyvryhc/settings/api

Copy the **service_role** key (under "Project API keys"). This bypasses RLS — keep it secret. You'll paste it into all three Vercel projects as `SUPABASE_SERVICE_ROLE_KEY`.

## Step 7 — Deploy each app to Vercel

Three separate Vercel projects, all pointing at the same GitHub repo, each with its own Root Directory.

### Per project, create a new project from the repo

1. https://vercel.com/new → import `asafhamo55-coder/HomeOwnerHub`
2. Project name: `homeowner-hub` (or `homeowner-hub-eviction` / `homeowner-hub-pm`)
3. Framework Preset: **Next.js**
4. Root Directory: **`apps/hoa`** (or `apps/eviction` / `apps/pm`)
5. Build & Output Settings:
   - **Install Command** (override ON): `cd ../.. && pnpm install --frozen-lockfile`
   - **Build Command** (override ON): `cd ../.. && pnpm turbo run build --filter=hoa` (substitute `eviction` / `pm`)
   - **Output Directory:** leave default (Vercel auto-detects `.next` inside the Root Directory)
   - Important: install must run as the install command, NOT inside the build command — Vercel checks for Next.js between install and build, so an `echo skip` install fails with "No Next.js version detected".
6. Set Production Branch to `claude/phase1-homeownerhub-setup-MILNu` (Settings → Git → Production Branch). Without this, Vercel only deploys `main`.
7. Paste env vars (next subsection) — pick the right block per app.
8. Click **Deploy**. First deploy takes 3–5 min.

### HOA env vars — paste into project `homeowner-hub`

```
NEXT_PUBLIC_SUPABASE_URL=https://xwdjsxfskvreguyvryhc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3ZGpzeGZza3ZyZWd1eXZyeWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTEwNjAsImV4cCI6MjA5MzY4NzA2MH0.4xSNopnsyFxN0OO7qq7LICin3QIH2VFxcqpSLgxTjps
SUPABASE_SERVICE_ROLE_KEY=<paste from step 6>

AI_BASE_URL=https://api.groq.com/openai/v1
AI_API_KEY=<your gsk_... from step 3>
AI_MODEL=llama-3.3-70b-versatile

AI_BASE_URL_FAST=https://api.groq.com/openai/v1
AI_MODEL_FAST=llama-3.1-8b-instant

AI_MODEL_CLOUD=llama-3.3-70b-versatile

STRIPE_SECRET_KEY=<sk_test_... from step 4>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<pk_test_... from step 4>
STRIPE_WEBHOOK_SECRET=<set in step 8 — leave blank for first deploy>
STRIPE_PRICE_STARTER=<price_... from step 4>
STRIPE_PRICE_STANDARD=<price_... from step 4>
STRIPE_PRICE_PRO=<price_... from step 4>

INNGEST_EVENT_KEY=<from step 5>
INNGEST_SIGNING_KEY=<from step 5>

NEXT_PUBLIC_APP_URL=https://homeowner-hub.vercel.app
NEXT_PUBLIC_HOA_URL=https://homeowner-hub.vercel.app
NEXT_PUBLIC_EVICTION_URL=https://homeowner-hub-eviction.vercel.app
NEXT_PUBLIC_PM_URL=https://homeowner-hub-pm.vercel.app
```

### Eviction env vars — paste into project `homeowner-hub-eviction`

```
NEXT_PUBLIC_SUPABASE_URL=https://xwdjsxfskvreguyvryhc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3ZGpzeGZza3ZyZWd1eXZyeWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTEwNjAsImV4cCI6MjA5MzY4NzA2MH0.4xSNopnsyFxN0OO7qq7LICin3QIH2VFxcqpSLgxTjps
SUPABASE_SERVICE_ROLE_KEY=<same as HOA>

AI_BASE_URL=https://api.groq.com/openai/v1
AI_API_KEY=<same gsk_... key>
AI_MODEL=llama-3.3-70b-versatile

STRIPE_SECRET_KEY=<sk_test_... same>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<pk_test_... same>
STRIPE_WEBHOOK_SECRET=<set in step 8>
STRIPE_PRICE_PER_CASE=<price_... from step 4>
STRIPE_PRICE_UNLIMITED=<price_... from step 4>

NEXT_PUBLIC_APP_URL=https://homeowner-hub-eviction.vercel.app
NEXT_PUBLIC_HOA_URL=https://homeowner-hub.vercel.app
NEXT_PUBLIC_PM_URL=https://homeowner-hub-pm.vercel.app
```

### PM env vars — paste into project `homeowner-hub-pm`

```
NEXT_PUBLIC_SUPABASE_URL=https://xwdjsxfskvreguyvryhc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3ZGpzeGZza3ZyZWd1eXZyeWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTEwNjAsImV4cCI6MjA5MzY4NzA2MH0.4xSNopnsyFxN0OO7qq7LICin3QIH2VFxcqpSLgxTjps
SUPABASE_SERVICE_ROLE_KEY=<same as HOA>

STRIPE_SECRET_KEY=<sk_test_... same>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<pk_test_... same>
STRIPE_WEBHOOK_SECRET=<set in step 8>
STRIPE_PRICE_PM_INVESTOR=<price_... from step 4>
STRIPE_PRICE_PM_PRO=<price_... from step 4>

NEXT_PUBLIC_APP_URL=https://homeowner-hub-pm.vercel.app
NEXT_PUBLIC_HOA_URL=https://homeowner-hub.vercel.app
NEXT_PUBLIC_EVICTION_URL=https://homeowner-hub-eviction.vercel.app
```

## Step 8 — Register Stripe webhooks

For each app, https://dashboard.stripe.com/test/webhooks → Add endpoint:

| App | Endpoint URL | Events |
|---|---|---|
| HOA | `https://homeowner-hub.vercel.app/api/webhooks/stripe` | `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed` |
| Eviction | `https://homeowner-hub-eviction.vercel.app/api/webhooks/stripe` | (same three) |
| PM | `https://homeowner-hub-pm.vercel.app/api/webhooks/stripe` | (same three) |

Each gives you a `whsec_...` signing secret. Paste into the matching Vercel project's `STRIPE_WEBHOOK_SECRET` env var, then **redeploy** that project (Deployments → ⋯ → Redeploy).

## Step 9 — Wire Inngest to production

https://app.inngest.com → your `homeownerhub` app → Apps → Sync new app

Sync URL: `https://homeowner-hub.vercel.app/api/inngest`

Inngest will hit that endpoint and discover all 5 cron functions:

- `daily-digest` (7am ET)
- `hoa-late-fees` (midnight ET)
- `pm-late-fees` (midnight ET)
- `eviction-reminders` (8am ET)
- `wizard-draft-reminders` (8am ET)

Confirm under **Functions** → all 5 listed.

## Step 10 — Smoke test

For each app:

- [ ] Page loads with no console errors
- [ ] Magic-link signup → email arrives → click → lands on dashboard
- [ ] Onboarding creates an org
- [ ] Hub switcher shows all three hubs with correct URLs
- [ ] Open an AI panel (e.g. HOA dashboard's daily digest) — confirm AI response renders, not "AI unavailable"

If AI panels say "AI unavailable", re-check `AI_BASE_URL` and `AI_API_KEY` env vars on the failing project — Vercel logs will show the Groq error.

## Step 11 — Madison Park dry-run

Open `MADISON_PARK_DEMO.md` and walk through the 15-minute checklist against the live URLs.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails: `Module not found: @homeownerhub/db` | Build command missing `--filter`; recheck step 7 |
| `relation "profiles" does not exist` | Re-run `0001_auth_fixes.sql` |
| `new row violates row-level security policy` on signup | `0001_auth_fixes.sql` not applied |
| Magic link 404s | Redirect URL not allowlisted in step 2 |
| Stripe webhook 400 | Wrong `STRIPE_WEBHOOK_SECRET` — each app has its own |
| AI panels show "AI unavailable" | Wrong `AI_BASE_URL` / `AI_API_KEY`, or Groq rate limit hit |
| Hub switcher links wrong | `NEXT_PUBLIC_*_URL` env vars typo'd |
| Inngest sync 401 | `INNGEST_SIGNING_KEY` missing on HOA project |
