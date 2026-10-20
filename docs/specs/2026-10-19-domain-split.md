# Domain split: marketing on www, the app on app.homeownerledger.com

Owner decision, 2026-10-19:

| Host | Today | After |
|---|---|---|
| `homeownerledger.com` | HOA project, redirects to www | marketing project, redirects to www |
| `www.homeownerledger.com` | HOA app (`home-owner-hub-hoa`) | marketing site (`homeownerhub-marketing`) |
| `app.homeownerledger.com` | does not resolve | HOA app (`home-owner-hub-hoa`) |

The inbound and sending email domain (`noreply@homeownerledger.com`,
`send.homeownerledger.com` MX to Amazon SES via Resend) does not change.

## What we found (read-only, 2026-10-19)

**Vercel, `home-owner-hub-hoa`** (`prj_SJjZ…38re`)
- Git: GitHub `asafhamo55-coder/HomeOwnerHub`, production branch
  `claude/phase1-homeownerhub-setup-MILNu`, root `apps/hoa`, build
  `cd ../.. && pnpm turbo run build --filter=hoa`.
- Domains: `www.homeownerledger.com` (serves); `homeownerledger.com`
  (redirects to www, default status). No `*.vercel.app` alias is attached.
- Current production deploy: `eb4f522`.
- URL-bearing env vars (values are "sensitive" and can't be read):
  `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_HOA_URL`, `EMAIL_ASSET_BASE_URL`
  (separate production and preview entries), `GOOGLE_OAUTH_REDIRECT_URI`.
  `NEXT_PUBLIC_EVICTION_URL` and `NEXT_PUBLIC_PM_URL` don't change.

**Vercel, `homeownerhub-marketing`** (`prj_CWtO…4CB`)
- **No git connection** (`link: null`). This is why it hasn't deployed in
  148 days (BL-100). Its last production deploy was a CLI or manual one, from
  `cf6d5a0` on the prod branch.
- Root directory `apps/marketing` is already set. So are the build command
  `cd ../.. && pnpm --filter marketing build`, the install command
  `cd ../.. && pnpm install --frozen-lockfile` and output `.next`, matching
  `apps/marketing/vercel.json`. "Include files outside root" is on.
- Domains: `homeownerhub.vercel.app` (serves) and
  `homeownerhub-marketing.vercel.app` (307 to the former).
- Env vars: **none**.
- `apps/marketing/vercel.json` already limits git deploys to the prod branch,
  so once a git connection exists only that branch deploys.

**DNS:** `homeownerledger.com` is registered elsewhere and its
**nameservers are Network Solutions** (`ns49/ns50.worldnic.com`), not
Vercel. The records under `vercel dns ls` (including a `*` ALIAS) have no
effect. `app.homeownerledger.com` currently has no record, so the CNAME has
to be added **at Network Solutions**. The apex resolves to `76.76.21.21`
(Vercel). `www` is a CNAME to `afa3394a804e31cd.vercel-dns-017.com`. Both
are project-agnostic, so moving them between Vercel projects needs no DNS
change.

## Dependency inventory: everything that names the www host

| Dependency | Where | Source of the host | Action |
|---|---|---|---|
| Auth email redirect (signup, forgot password, magic link) | `(auth)/*Form.tsx` | env `NEXT_PUBLIC_APP_URL`, falling back to `window.location.origin` | Env change (step 3). Supabase allow-list (step 2). |
| Supabase `/auth/callback` | `app/auth/callback/route.ts` | relative (`request.url`) | none |
| Member invites (`inviteUserByEmail`) | `lib/members.ts` | **was hard-coded www fallback** → now `appUrl()` | env |
| Resident, board, vendor and RFP links in email and SMS | `appUrl()` in `lib/email.ts` (now `lib/app-origin.ts`); `communications/send.ts` SMS link **was hard-coded** | env `NEXT_PUBLIC_APP_URL` | env |
| Links in **already-sent** email (portal, magic links, RFP and vendor tokens, `/settings/notifications`) | inboxes | baked in as `https://www.homeownerledger.com/...` | marketing middleware redirects them (step 5) |
| Unsubscribe / notification settings | No `List-Unsubscribe` header. Monthly report links `/settings/notifications` via `appUrl()` | env | already-sent links covered by the redirect |
| Email images | `lib/email/asset-url.ts` | env `EMAIL_ASSET_BASE_URL` (hard fail if unset) | env change (step 3). Images in sent mail and in DB template rows (`seed-community-templates.sql`) point at `www/email/v1/*`, which marketing redirects. |
| Stripe Checkout success/cancel, billing-portal return | `lib/billing.ts` | env (now via `appOrigin()`) | env |
| Stripe webhook endpoint | Stripe dashboard → `/api/webhooks/stripe` | dashboard setting | **Asaf**: change the endpoint URL host to app *before* www moves. Stripe doesn't follow redirects. |
| Resend webhook (delivery + inbound `email.received`) | Resend dashboard → `/api/webhooks/resend` | dashboard setting | **Asaf**: change it to app before www moves |
| Inbound email domain | Resend receiving | DNS MX (`send.` subdomain) | none |
| Inngest serve URL | Inngest Cloud app sync → `/api/inngest` | dashboard setting | **Asaf**: re-sync to `https://app.homeownerledger.com/api/inngest` before www moves |
| Vercel cron (`/api/cron/recurring-events`) | `apps/hoa/vercel.json` | relative path on the deployment | none |
| Plaid ingest (`/api/webhooks/plaid`) | Plaid or caller config | dashboard or caller | **Asaf**: check where it's configured and move it to app |
| Gmail mailbox OAuth redirect | `packages/mailbox/src/oauth.ts` | env `GOOGLE_OAUTH_REDIRECT_URI` + Google Cloud console allow-list | **Asaf**: add the app URI in Google (step 2). Env change (step 3). The callback is session-independent (signed `state`), so a www redirect in flight still completes via the redirect. |
| PWA manifest | `app/manifest.ts` | relative `start_url: '/'`, no `scope` | none. Installed home-screen apps keep the www origin; see the PWA note. |
| Service worker + web push | `public/sw.js`, `packages/jobs/src/web-push.ts` | origin-bound (the registration lives on www) | see the PWA note |
| VAPID subject | `web-push.ts` | `mailto:support@…` | none |
| Release-notes workflow | `.github/workflows/release-notes.yml`, `scripts/release-notes/lib/brand.ts` | **was hard-coded** → repo variable `APP_ORIGIN`, falling back to www | `gh variable set APP_ORIGIN` (step 3). `curl` now follows redirects (`-L`). |
| Smoke workflow | `.github/workflows/smoke.yml` | **was hard-coded** → `vars.APP_ORIGIN` | same variable |
| `scripts/devops.sh`, `scripts/e2e-smoke.ts` | `HOA_URL` env, default www | env + default | flip the default after step 5 (both follow redirects once marketing is on www) |
| Hub switcher (HOA) | `HoaHubSwitcher.tsx` | env (now `appOrigin()`) | env. PM and Eviction projects read `NEXT_PUBLIC_HOA_URL`; hubs are disabled (BL-097), so updating it is optional. |
| Marketing "Sign in" | `apps/marketing/src/components/site/brand.tsx` | **was hard-coded www/login** → `NEXT_PUBLIC_APP_URL`, default `https://app.homeownerledger.com` | none needed. Optionally set the env on the marketing project. |
| Marketing `metadataBase` | `apps/marketing/src/app/layout.tsx` | **was `https://ledger.ai`** → `https://www.homeownerledger.com` | done |
| CSP | none in either app. HOA sends HSTS (`includeSubDomains; preload`), XFO, etc. | n/a | none. Marketing sends no HSTS; adding it is a later nicety. |
| Cookies | Supabase SSR cookies, no `domain` option | host-only | none. **Sessions don't carry from www to app:** every user signs in once on app. |
| `support@homeownerledger.com`, `noreply@…` | email addresses | n/a | none |

Hard-coded values left alone on purpose: test fixtures and placeholder
links in `NewCommunicationWizard` (preview only), and `generate-community-
templates-sql.ts` (an example in an error message).

**Unrelated finding:** marketing still uses `ledger.ai` email addresses
(`demo@`, `privacy@`, `security@`, `legal@`, `status@`) in `demo/actions.ts`,
`privacy`, `security`, `dpa` and `status`. `ledger.ai` isn't ours. The demo
form's default From address (`DEMO_FROM_EMAIL` unset) can't send via Resend.
This needs a content decision; not changed here.

### PWA note

The app's service worker is registered on the **www origin**. After www moves:
- A board member's installed home-screen app still launches `www/`.
  Marketing's middleware sends `/` to the app **only for a browser still
  holding the app's old `sb-*-auth-token` cookie**, so those launches land
  in the app. Everyone else sees the marketing home page.
- The old www service worker stays installed. Marketing neither serves nor
  redirects `/sw.js`, and a failed update check leaves the registration in
  place. That is deliberate: it keeps **existing push subscriptions
  delivering**. Notification clicks open `www/<path>`, which redirects to
  app. The worker is network-first, so it doesn't break marketing pages.
- When a user enables push again on app, that device has two subscriptions,
  and the same ticket shows twice (tags are per origin). Clean this up later
  (step 7).

## Code changes (this branch)

- `apps/hoa/src/lib/app-origin.ts`: `appOrigin()` / `appUrl()`, one place
  reading `NEXT_PUBLIC_APP_URL`. The fallback is `https://www.homeownerledger.com`
  in production and localhost elsewhere, so nothing changes until the env
  var does. `lib/email.ts` re-exports `appUrl`. `members.ts`,
  `communications/send.ts`, `billing.ts`, `dues-reminders/actions.ts` and
  `HoaHubSwitcher.tsx` use it.
- `apps/marketing/src/middleware.ts` + `src/lib/app-redirects.ts`: 307 every
  old app path to the app origin, keeping path and query. The list covers
  each top-level route of `apps/hoa/src/app` (route groups flattened), plus
  `email/`, `icon`, `apple-icon`. The test fails if a new HOA route is
  missing from the list, or if an entry would shadow a marketing route.
  A request already on the app host is never redirected (no loops).
- `apps/marketing/src/lib/app-origin.ts`: the app origin from
  `NEXT_PUBLIC_APP_URL`, defaulting to `https://app.homeownerledger.com`
  (never www, which would loop). The "Sign in" links use it. There's no
  "Get started" link on the site today: all primary CTAs go to `/demo`.
- Marketing `metadataBase` is now `https://www.homeownerledger.com`.
- `release-notes.yml` / `smoke.yml` / release-notes `brand.ts` read
  `APP_ORIGIN` (repo variable), defaulting to www.

## Runbook

Run steps 1 to 6 in one sitting, at a quiet hour. Steps marked
**[Claude/Vercel CLI]** can be run by Claude. Steps marked **[Asaf: dashboard]**
need a human in that dashboard.

### 0. Ship this branch [Claude]
Merge to the prod branch. On deploy, nothing changes: the env var isn't set
to app yet, and the marketing project isn't connected.
*Rollback:* revert the merge.

### 1. Put app.homeownerledger.com on the HOA project
- **[Claude/Vercel CLI]** `vercel domains add app.homeownerledger.com home-owner-hub-hoa`
  (or `vercel api -X POST /v10/projects/home-owner-hub-hoa/domains -f name=app.homeownerledger.com`).
- **[Asaf: Network Solutions DNS]** Add a `CNAME app` record pointing to the
  target Vercel shows for the domain (normally `cname.vercel-dns.com`).
- **[Claude]** Wait for verification and the certificate, then check:
  `curl -fsS https://app.homeownerledger.com/api/health` should report the
  same `version` as www.

Both hosts now serve the same deployment. www is untouched.
*Rollback:* `vercel domains rm app.homeownerledger.com`, delete the CNAME.

### 2. Allow the new host everywhere [Asaf: dashboard]
Do all of this before any env var changes.
- **Supabase → Auth → URL Configuration:** add
  `https://app.homeownerledger.com/**` to Redirect URLs. Keep the www
  entries. Leave **Site URL** on www for now. If your Supabase email
  templates use `{{ .SiteURL }}`, those links reach app through the
  redirect after step 5.
- **Google Cloud → OAuth client → Authorized redirect URIs:** add
  `https://app.homeownerledger.com/api/oauth/google/callback`. Keep www.
- **Stripe → Developers → Webhooks:** edit the HOA endpoint's URL to
  `https://app.homeownerledger.com/api/webhooks/stripe`. Editing the URL
  keeps the signing secret, so `STRIPE_WEBHOOK_SECRET` doesn't change.
  Check the next event delivers 2xx. Checkout and portal URLs come from
  code, so nothing else changes in Stripe.
- **Resend → Webhooks:** move the endpoint to
  `https://app.homeownerledger.com/api/webhooks/resend`, keeping the secret.
  If Resend issues a new one, update `RESEND_WEBHOOK_SECRET` in the same
  sitting.
- **Inngest Cloud → Apps:** re-sync to
  `https://app.homeownerledger.com/api/inngest`.
- **Plaid** (if a webhook URL is configured there): move it to app.

*Rollback:* each one is additive or a URL edit back to www. The www host
still serves the app until step 5.

### 3. Make app the canonical host
- **[Claude/Vercel CLI]** On `home-owner-hub-hoa`, production, set these.
  The vars are sensitive, so the steps are rm then add, with values piped
  in and never echoed.
  - `NEXT_PUBLIC_APP_URL=https://app.homeownerledger.com`
  - `EMAIL_ASSET_BASE_URL=https://app.homeownerledger.com`
  - `GOOGLE_OAUTH_REDIRECT_URI=https://app.homeownerledger.com/api/oauth/google/callback`
  - optional: `NEXT_PUBLIC_HOA_URL=https://app.homeownerledger.com`
- **[Claude/Vercel CLI]** Redeploy production (`NEXT_PUBLIC_*` is
  inlined at build time). Then check `/api/health` on app for the new
  `version`.
- **[Claude/Vercel CLI]** On the HOA project, set `www.homeownerledger.com` to
  **redirect to `app.homeownerledger.com` (307)**, and point the apex
  redirect at app too:
  `vercel api -X PATCH /v9/projects/home-owner-hub-hoa/domains/www.homeownerledger.com -F redirect=app.homeownerledger.com -F redirectStatusCode=307`.
  This step matters. Magic links are PKCE: the code verifier cookie lives
  on the host where the user asked for the link. Once links point at app, a
  user still signing in on www would get a link that can't be exchanged.
  Redirecting www now puts every sign-in on app. The redirect keeps path
  and query, and webhooks have already moved (step 2).
- **[Claude/gh]** `gh variable set APP_ORIGIN --body https://app.homeownerledger.com`
  (release-notes and smoke workflows).

*Rollback:* restore the three env vars to `https://www.homeownerledger.com`
(and the www-based OAuth URI), remove the www redirect
(`-F redirect=null`), and redeploy. Run `gh variable delete APP_ORIGIN`.

**Expected side effect:** everyone signs in once more. Cookies are
host-only, so a www session doesn't carry to app. A magic link requested on
www in the hour before this step fails with `exchange_failed`; requesting a
new one fixes it.

### 4. Verify login on app [Asaf + Claude]
- **[Asaf]** In Safari: password sign-in, a magic link (request it on app,
  confirm the email link points at app and lands you signed in), a password
  reset, and a resident portal page. **Settings → Mailbox → reconnect
  Gmail** confirms the OAuth URI.
- **[Claude]** `curl -sI https://www.homeownerledger.com/login?redirect=%2Fapprovals`
  should return 307 to `https://app.homeownerledger.com/login?redirect=%2Fapprovals`.

Stop here if anything fails. *Rollback:* step 3's rollback.

### 5. Connect and deploy the marketing project
- **[Asaf: dashboard]** Vercel → `homeownerhub-marketing` → Settings → Git →
  connect `asafhamo55-coder/HomeOwnerHub`. Set the production branch to
  `claude/phase1-homeownerhub-setup-MILNu`. Keep root `apps/marketing`.
  The CLI equivalent is `vercel git connect` run from a checkout linked to
  that project, but the repo's `.vercel` link points at the wrong project
  (see memory), so the dashboard is safer.
- **[Claude/Vercel CLI]** Optional: set `NEXT_PUBLIC_APP_URL=https://app.homeownerledger.com`
  on the marketing project (it is also the code default). Trigger a
  production deploy and check `https://homeownerhub.vercel.app/` renders
  and `/login` 307s to app.

*Rollback:* disconnect git. The project serves no custom domain yet, so
nothing user-facing changes.

### 6. Move www and the apex to marketing
- **[Claude/Vercel CLI]** Remove `www.homeownerledger.com` and
  `homeownerledger.com` from `home-owner-hub-hoa`. Add them to
  `homeownerhub-marketing`, with the apex redirecting to www (308). DNS
  doesn't change: both records are Vercel-generic.
  ```
  vercel domains rm www.homeownerledger.com   # (project-scoped API: DELETE /v9/projects/home-owner-hub-hoa/domains/<name>)
  vercel domains rm homeownerledger.com
  vercel domains add www.homeownerledger.com homeownerhub-marketing
  vercel domains add homeownerledger.com homeownerhub-marketing   # then PATCH redirect=www.homeownerledger.com
  ```
  Add them to marketing straight after removing them, so www is down for
  only a few seconds. Vercel won't attach a domain to two projects at once.
- **[Asaf: Supabase]** Change **Site URL** to `https://app.homeownerledger.com`.

*Rollback:* move both domains back to `home-owner-hub-hoa` (www redirecting
to app, as in step 3, or serving directly) and set Site URL back.

### 7. Smoke-test old links [Claude]
Each should give a 307 to the same path and query on app:
- `https://www.homeownerledger.com/login`
- `https://homeownerledger.com/login` (apex → www → app)
- `https://www.homeownerledger.com/auth/callback?code=x&next=/resident`
- `https://www.homeownerledger.com/resident/tickets/<id>`,
  `/communications/<id>`, `/rfp-bid/<token>`, `/vendor-onboard/<token>`
- `https://www.homeownerledger.com/email/v1/pool-pass-renewal.png`
  should reach a 200 PNG via `-L`.
- `https://www.homeownerledger.com/` renders marketing (200), and "Sign in"
  links to `app…/login`.
- `https://app.homeownerledger.com/api/health` is ok. Stripe, Resend and
  Inngest dashboards show recent 2xx deliveries.
- **[Asaf]** Open the home-screen PWA if installed: it should land in the app.

Then make one commit flipping the `HOA_URL` default in `scripts/devops.sh`
and `scripts/e2e-smoke.ts` to app, and updating the comments in smoke.yml.
*Rollback:* step 6's rollback.

### 8. Later (2 to 4 weeks)
- **[Asaf: dashboard]** Remove the www entries from Supabase Redirect URLs
  and the Google OAuth client. Keep the www → app path redirects in
  marketing **forever**: sent email doesn't expire.
- Retire the old www service worker. Ship a marketing `/sw.js` that
  unregisters itself, once residents have enabled push on app. Prune push
  subscriptions created on the www origin.
- Consider switching the marketing redirects from 307 to 308.
- Fix the `ledger.ai` contact addresses on the marketing site.
