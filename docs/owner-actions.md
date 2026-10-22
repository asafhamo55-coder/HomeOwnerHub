# Owner action items

Things only Asaf can do. Everything else, Claude does on its own.

This file is the single source of truth. Whenever it changes, and every
Monday morning while anything is still open, GitHub emails Asaf a branded
checklist made from the **Open** section below
(`.github/workflows/owner-actions.yml`). Tick an item off by telling Claude
it is done; Claude moves it to **Done**.

Each item has a stable id (OA-1, OA-2, ...) and an urgency:

- **Urgent**: something is broken or blocked for customers until you do it.
- **Soon**: a finished feature is waiting on you, or a risk is growing.
- **Whenever**: useful, but nothing breaks if it waits.

## Why these need you

Claude Code runs with a permission system that you control. On purpose, it
blocks Claude from:

- reading or changing the **production database** (Supabase),
- running the **Stripe and Supabase command-line tools** against your live accounts,
- your **dashboards, DNS and API keys** (Vercel, Network Solutions, Google, Resend, Plaid, Vonage, Inngest),
- **editing its own permissions**.

So Claude prepares everything (the SQL files, the exact clicks, the code that
switches on afterwards) and you do the one step that needs your login.

**Optional:** to let Claude do some of this itself next time, type
`/permissions` in Claude Code and add an allow rule, for example
`Bash(supabase db query:*)` for database queries or `Bash(stripe:*)` for the
Stripe CLI. Only add rules you are comfortable with; you can remove them the
same way. Claude will never add them for you.

**How to run a SQL file** (used by several items below): open the Supabase
dashboard for the production project, go to **SQL Editor**, click **New
query**, paste the part of the file the item names, and click **Run**. Ask
Claude to copy any file (or one part of it) to your clipboard if that is
easier. Never paste a key or password into a file in this repo; it is public.

## Open

### OA-5 · Move the app to homeownerledger.online

**Urgency:** Soon

**Why it matters:** this splits the marketing site from the app. The app
moves to its own domain, `https://homeownerledger.online` (decided
2026-10-21), and marketing stays on `www.homeownerledger.com`. Email keeps
sending from `homeownerledger.com`. The marketing site has not deployed in
about 148 days because its Vercel project is not connected to GitHub.
Already done in Vercel: `homeownerledger.online` is on the HOA project, and
`www.homeownerledger.online` redirects to it. The `app.homeownerledger.com`
CNAME from the earlier plan is no longer needed; do not add it.

**Steps:**

1. **DNS (Network Solutions, homeownerledger.online):** add an A record: host `@`, value `216.198.79.1` (the alternative `76.76.21.21` also works).
2. **DNS (Network Solutions, homeownerledger.online):** add a CNAME record: host `www`, value `afa3394a804e31cd.vercel-dns-017.com`.
3. **DNS (Network Solutions, homeownerledger.online):** delete the parking A record `208.91.197.27`.
4. **Supabase:** Authentication → URL Configuration → add `https://homeownerledger.online/**` to Redirect URLs. Keep the www entries for now.
5. **Google Cloud (OAuth client):** add the authorized redirect URI `https://homeownerledger.online/api/oauth/google/callback`. Keep the www one for now.
6. **Webhooks, Stripe:** change the HOA endpoint URL to `https://homeownerledger.online/api/webhooks/stripe` (editing the URL keeps the signing secret).
7. **Webhooks, Resend:** change the endpoint URL to `https://homeownerledger.online/api/webhooks/resend`. If Resend issues a new signing secret, tell Claude.
8. **Webhooks, Plaid:** if a webhook URL is set, change it to `https://homeownerledger.online/api/webhooks/plaid`.
9. **Inngest:** re-sync the production app at `https://homeownerledger.online/api/inngest`.
10. **Vercel (unchanged):** connect the `homeownerhub-marketing` project to GitHub (production branch, root directory `apps/marketing`).
11. Tell Claude these are done. Claude runs the rest of the runbook (steps 3 to 7).

**Files:** `docs/specs/2026-10-19-domain-split.md`

### OA-6 · Add the Stripe test keys

**Urgency:** Soon

**Why it matters:** with these, the automatic checks can rehearse real
checkouts in Stripe's test mode, so payment bugs are caught before
customers hit them.

**Steps:**

1. In the Stripe dashboard, switch to **Test mode** and copy the test secret key and the test webhook signing secret.
2. In a terminal in the repo, run `gh secret set STRIPE_TEST_SECRET_KEY` and paste the key when asked. Then `gh secret set STRIPE_TEST_WEBHOOK_SECRET` and paste the webhook secret. Never paste them into a file.
3. Still in test mode, open **Settings → Billing → Customer portal** and click **Save** once.
4. Check live vs test mode: a checkout link that contains `cs_live_` is live. Tell Claude which one the app uses today.

**Files:** `docs/specs/2026-10-19-stripe-sandbox.md`

### OA-7 · Confirm the scheduled-messages job in Inngest

**Urgency:** Soon

**Why it matters:** messages a board schedules for later are only sent if
this job is registered.

**Steps:**

1. Open the Inngest dashboard for production and sync the app.
2. Check that a function named `communications-scheduled-dispatch` is listed. Tell Claude yes or no.

### OA-8 · Rename the Stripe product

**Urgency:** Whenever

**Why it matters:** customers see the old name "HOA Hub" on Stripe receipts
and checkout instead of HomeownerHub.

**Steps:**

1. In the Stripe dashboard, open **Products** and rename "HOA Hub" to "HomeownerHub".
2. Tell Claude in the same sitting, so it changes `PRODUCT_NAME` in `apps/hoa/src/app/api/admin/setup-stripe-pricing/route.ts` to match.

### OA-9 · Load Florida, California and Texas law into the app (and Georgia's verbatim text)

**Urgency:** Soon

**Why it matters:** production only has Georgia's HOA law loaded. Until Florida, California and Texas are loaded, the app says "<State> state law isn't loaded yet" instead of answering law questions for those states. It never answers from memory. Georgia's loaded rows are paraphrased summaries; running GA once replaces them with the statute's exact words (Property Owners' Association Act, 17 sections, plus the 2026 attorney's-fee rule).

**Ready now:** the CA/TX loaders went live on 2026-10-20 at 12:31 ET (deploy 7b1c601b).

**Steps:**

1. Sign in to the production app as the platform admin.
2. Open the browser's developer console on any app page and paste this line once each for `'FL'`, `'CA'`, `'TX'` and `'GA'` (change the two letters):
   `fetch('/api/admin/refresh-state-law',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:'FL'})}).then(r=>r.json()).then(console.log)`
   Each should print `queued`.
3. A few minutes later, tell Claude. It checks the counts (expected: FL 36, CA 234, TX 61 sections; GA 18 written, 2 retired — the seed's "44-3-225(b)" and "44-3-236" rows, which are not sections of the Act). After the Inngest sync (OA-7), a weekly job keeps them current on its own.
4. Georgia only: its text is a snapshot committed to the repo (Georgia's official code can't be fetched automatically), good until 2027-01-01, when the 2026 HOA law (SB 406) changes four sections. Before then, ask Claude to refresh it (data/statutes/README.md, "Georgia snapshot"). If it is not refreshed, the weekly job reports Georgia as failed and keeps the current text; it never deletes it.

**Files:** `docs/specs/2026-10-15-sub-project-F-law-to-bylaw.md` §11

### OA-10 · Run the S-01 audit query

**Urgency:** Whenever

**Why it matters:** a read-only check that no one used the owner-portal
"enter as" feature outside their own HOA before that hole was closed.

**Steps:**

1. Ask Claude to copy the S-01 audit query to your clipboard.
2. Run it on its own in the SQL Editor. It only reads. Send Claude the row count.

### OA-11 · Decide on text messages (Vonage and 10DLC)

**Urgency:** Whenever

**Why it matters:** only needed if you want the app to send SMS. US carriers
require a 10DLC registration before business texts are delivered.

**Steps:**

1. Tell Claude whether texting is wanted.
2. If yes: create the Vonage account, start the 10DLC brand and campaign registration, and add the Vonage keys as Vercel production environment variables.
3. In Vonage, set a HELP auto-reply on the number or campaign (for example "HomeownerHub alerts for your HOA. Reply STOP to stop. Help: support@homeownerledger.com"). Residents' consent wording promises HELP works.

### OA-12 · Confirm the support inbox

**Urgency:** Whenever

**Why it matters:** the app tells customers to write to
support@homeownerledger.com. If no one reads that inbox, their emails are lost.

**Steps:**

1. Send a test email to support@homeownerledger.com and check it arrives somewhere you read.
2. Tell Claude yes or no.

### OA-13 · Rotate the Supabase service-role key

**Urgency:** Whenever

**Why it matters:** routine security hygiene before any investor due
diligence. Claude has the background.

**Steps:**

1. In the Supabase dashboard, open **Project Settings → API** and rotate the service-role key.
2. Put the new key in Vercel (production environment) and GitHub secrets where the old one was. Never in a file.
3. Tell Claude, so it can check the app still works.

### OA-14 · Turn on two more Stripe webhook events

**Urgency:** Soon

**Why it matters:** the app now handles subscription changes (cancellations,
door-count changes) and failed card payments, and shows boards a "payment
past due" banner. Stripe only sends these events if the webhook asks for them.

**Steps:**

1. In the Stripe dashboard (live mode), open **Developers → Webhooks** and click the app's endpoint.
2. Click **Edit destination / Select events** and add `customer.subscription.updated` and `invoice.payment_failed`. Keep the events already selected.
3. Save, and tell Claude it's done.

**Files:** `docs/specs/2026-10-19-stripe-sandbox.md`

### OA-15 · Fill in the investor deck's traction numbers

**Urgency:** Whenever

**Why it matters:** the investor deck was refreshed on 2026-10-20 for the new
brand, features and pricing. Its traction boxes still say "ASAF TO FILL",
because only you know these numbers (pilot HOAs, doors, paying customers,
conversations). Note too that the market-size slide is lower at the new
prices; review it before pitching.

**Steps:**

1. Open `~/HomeownerHub-decks/HomeownerHub-Investor-Deck.pptx` on your Mac (it is not in the repo).
2. Send Claude the real traction numbers, or tell Claude to remove the traction slide. Claude rebuilds the deck.

### OA-16 · Prepare Stripe for the new Essentials / Complete pricing

**Urgency:** Whenever

**Why it matters:** the new pricing (decision `docs/decisions/2026-10-20-pricing.md`) is built but switched off. Checkout still charges $4.99 per door. Before Claude can switch it on, Stripe needs the new prices, and we need to know who is on the old ones so they keep their price until renewal.

**Steps:**

1. In the Stripe dashboard (live mode), open **Billing → Subscriptions** and filter by the prices with lookup keys `hoa_per_door_monthly` and `hoa_per_door_annual`. Tell Claude how many there are and, for each, the HOA name, monthly or annual, and when its current term ends. Send no card or bank details.
2. Switch to **Test mode**. Create the four tiered prices exactly as listed in `docs/specs/2026-10-20-pricing-v2-rollout.md` (lookup keys `hoa_essentials_monthly`, `hoa_essentials_annual`, `hoa_complete_monthly`, `hoa_complete_annual`). Keep the old per-door prices active.
3. In test mode, open **Settings → Billing → Customer portal**: turn quantity editing off, then tell Claude whether the portal lets a customer switch between two tiered prices.
4. Tell Claude when these are done. Claude tests checkout in test mode, then tells you when to create the same prices in live mode.

**Files:** `docs/specs/2026-10-20-pricing-v2-rollout.md`

### OA-18 · Confirm the new wording of your founder quote

**Urgency:** Whenever

**Why it matters:** the marketing site quotes you. Two phrases in it couldn't be backed up, so Claude changed them: "180-home HOAs" is now "whole HOAs" (Madison Park has 49 homes), and "We're the only platform built around that" is now "We built HomeownerHub around that". They are your words, so you should approve them.

**Steps:**

1. Read the "From the founder" quote in `apps/marketing` (Claude can paste it into an email to you).
2. Tell Claude "OK" or send the wording you want.

### OA-19 · Decide: should vendors get automatic insurance-expiry emails?

**Urgency:** Whenever

**Why it matters:** until today, when a board turned on vendor insurance reminders, the app emailed vendors automatically 30, 7 and 0 days before their insurance certificate expired. That automatic email is now off (decision `docs/decisions/2026-10-20-vendor-coi-reminders-board-only.md`). The board gets a notice instead and can send a ready-made "please send your updated certificate" email with one click.

**Steps:**

1. Tell Claude either "keep it board-only" or "turn automatic vendor emails back on".
2. If you want them back on, Claude may need you to allow that change in Claude Code's permissions. It will say exactly what to allow.

**Files:** `docs/decisions/2026-10-20-vendor-coi-reminders-board-only.md`

### OA-20 · Check one Georgia law paragraph against the official code

**Urgency:** Whenever

**Why it matters:** the new Georgia "Statement of Amounts Due" follows O.C.G.A. § 44-3-232(d): 5 business days, and a $10 fee only if the declaration allows it. Claude couldn't open Georgia's official online code (LexisNexis public access) automatically, so it used two matching copies of that paragraph from bills on legis.ga.gov. A single look at the official text confirms it.

**Steps:**

1. Open the Georgia Code public-access site (via legis.ga.gov → "Georgia Code"), go to Title 44, Chapter 3, Article 6, § 44-3-232, subsection (d).
2. Compare it with `scripts/fixtures/state-law/ga-ocga-44-3-232-2026.txt`, and tell Claude "matches" or paste any difference.

**Files:** `scripts/fixtures/state-law/ga-ocga-44-3-232-2026.txt`

### OA-22 · Choose who gets the daily AI-cost alert

**Urgency:** Whenever

**Why it matters:** a new daily check emails a warning if the whole platform's estimated AI spend passes $50 in a day, so a runaway bug or abuse is caught within a day. It needs an address to send to; until then it only writes a log line.

**Steps:**

1. In Vercel → the `home-owner-hub-hoa` project → Settings → Environment Variables, add `AI_SPEND_ALERT_TO` for **Production** with your email address (you can list several, separated by commas).
2. Tell Claude. It redeploys and confirms the next morning's run.

### OA-23 · Let residents text STOP and START (Vonage setup)

**Urgency:** Whenever

**Why it matters:** do this together with OA-11 if you turn texting on. Residents can already stop texts in their portal. With this, replying STOP to a text also records the opt-out in HomeownerHub, and START turns texts back on, as US texting rules expect. The code is built but off until Vonage is set up.

**Steps:**

1. In the Vonage dashboard → Settings → API settings → SMS settings, switch to **Messages API**. Sending isn't affected.
2. Copy Settings → **Signature secret** into the Vercel production env var `VONAGE_SIGNATURE_SECRET`.
3. Create an Application with the Messages capability. Set its Inbound URL to `https://www.homeownerledger.com/api/webhooks/vonage/inbound` (POST), and link the sending number to it.
4. Make sure the HELP and STOP auto-replies in the 10DLC campaign name the program and give a contact.
5. Set `SMS_INBOUND_ENABLED=true` in Vercel production and tell Claude. Claude redeploys and tests STOP/START with you.

**Files:** `docs/specs/2026-10-20-sms-inbound.md`

### OA-24 · Turn on privacy-safe usage analytics

**Urgency:** Whenever

**Why it matters:** we can't see which features boards and residents actually use. The app now has cookieless, privacy-safe analytics built in: page views with record ids scrubbed out, plus 8 named events (for example "approval decided" and "message sent") that carry no names, emails or text. It records nothing until you turn it on.

**Steps:**

1. In Vercel, open the `home-owner-hub-hoa` project → **Analytics** → **Web Analytics** → **Enable**.
2. In Settings → Environment Variables, add `NEXT_PUBLIC_ANALYTICS_ENABLED` = `1` for **Production**.
3. Tell Claude. It redeploys, since the setting takes effect only on a new build. The 8 named events need a Vercel Pro plan; page views work on any plan.

### OA-25 · Turn off quantity editing in the Stripe customer portal

**Urgency:** Soon

**Why it matters:** the app sends boards to Stripe's billing portal to manage their subscription. If that portal lets customers change their quantity, a board could lower the number of homes it pays for, and the app would then reduce its home count to match. The app doesn't control this setting; it's in your Stripe dashboard.

**Steps:**

1. In the Stripe dashboard, open **Settings → Billing → Customer portal** (do it in both **Test mode** and live mode).
2. Under subscriptions, turn **off** "Customers can update quantities" (and leave plan switching off for now).
3. Click **Save**, then tell Claude.

**Files:** `docs/specs/2026-10-20-pricing-v2-rollout.md`

### OA-26 · (Optional, later) Give board settings their own signing secret

**Urgency:** Whenever

**Why it matters:** board settings saved in the app (Zelle details, reminders, receipts and similar) are signed so they can't be tampered with. Today that signature reuses an older database key. A dedicated secret is cleaner. **The catch:** after the switch, every saved board setting except Zelle reads as "off" until a board member saves it again. So do this when you can tell boards to re-save their settings, not before.

**Steps:**

1. Ask Claude first. It will confirm which settings each HOA has saved, so you know who to tell.
2. In Vercel (both the hoa and jobs projects, Production), add `PAY_SETTINGS_SECRET` with a long random value. You can make one in Terminal with `openssl rand -base64 48`.
3. In the same place, add `PAY_SETTINGS_SECRET_PREVIOUS`, set to the value the app uses today (Claude will tell you which one).
4. Redeploy, tell boards to re-save their settings, then remove `PAY_SETTINGS_SECRET_PREVIOUS` a week later.

### OA-27 · Show "delivered" on texts (Vonage delivery receipts)

**Urgency:** Whenever

**Why it matters:** today a text message only ever shows as "sent", never "delivered" or "not delivered". The app can now take Vonage's delivery receipts and mark each text as delivered, or as failed with the reason. The code is built but off. Texts now go through Vonage's Messages API (BL-146b) with your existing key and secret, so no new keys are needed and receipts can be matched once this is on.

**Steps:**

1. Do OA-23 first, or at least its steps 1 to 3: the Messages API setting, the signature secret in `VONAGE_SIGNATURE_SECRET`, and the Application.
2. In that Vonage Application, set the **Status URL** to `https://www.homeownerledger.com/api/webhooks/vonage/status` (POST). Save.
3. Also in the Vonage dashboard → **API Settings** → Messages API, set the account-level **Status URL** to the same address (POST). Save. Texts are sent with the key and secret, not the Application, so this is where Vonage sends their receipts.
4. Set `SMS_STATUS_WEBHOOK_ENABLED=true` in Vercel production, then tell Claude. Claude redeploys and checks one test text shows "delivered".

**Files:** `docs/specs/2026-10-21-sms-delivery-receipts.md`

## Done

### OA-1 · Run the database steps in the SQL runbook (start here)

**Done:** 2026-10-20 (owner ran the SQL runbook; Claude verified each check)

**Urgency:** Urgent

**Progress:** sections A (0063) and B (M1) are done (Asaf, 2026-10-20 evening). Claude switched M1 on. Continue from section C.

**Why it matters:** until the M1 batch (migration 0064) is applied, Stripe's
"subscription changed" messages fail to save, so an HOA that pays stays on
the Free plan. Stripe retries each message for 3 days, so customers who pay
in the meantime can still be fixed, but only for those 3 days. 0063 must go
first: it closes the security gaps in who can see which records, and M1
refuses to run without it. Every other pending SQL step (OA-2, OA-21,
OA-17, OA-4, OA-3) is in the same runbook, in a safe order, so this is the
single place to start.

**Steps:**

1. Open `docs/specs/2026-10-20-sql-runbook.md`. It lists 43 small steps in sections A to I, each with the exact file part to paste, what it does, whether it only reads, what you should see, and what to send Claude.
2. Do **Section A** (0063) and **Section B** (M1) today; they are the urgent part. After step B5, tell Claude "M1 is applied". Claude switches the new features on (`M1_APPLIED` in `packages/db/src/m1.ts`) and deploys.
3. Continue with Sections C to G when you have time. Each section also closes one item below (C = OA-2, D = OA-21, E = OA-17, F = OA-4, G = OA-3). Section H (0065) and Section I (0066, owner records requests and the Fined / Dismissed violation statuses) have no separate item; after I3, tell Claude "0066 is applied" and Claude switches records requests on (`RECORDS_REQUESTS_LIVE`) and the Fined / Dismissed statuses on (`VIOLATION_FINED_STATUS_LIVE`).
4. Ask Claude to copy any step to your clipboard ("copy step B4"). If any step errors, stop and send Claude the error and the step number.

**Files:** `docs/specs/2026-10-20-sql-runbook.md`, `docs/specs/2026-10-16-rls-sweep-apply.sql`, `docs/specs/2026-10-18-m1-apply.sql`

### OA-2 · Show the resident "Meetings and notices" page

**Done:** 2026-10-20 (owner ran the SQL runbook; Claude verified each check)

**Urgency:** Soon

**Why it matters:** the resident meetings page is built and deployed, but it
stays hidden until this small database function exists. No deploy is needed
afterwards; the page appears on its own.

**Steps:**

1. Do OA-1 first (0063 and M1).
2. Run the whole of `docs/specs/2026-10-19-resident-meeting-notices.sql` in the SQL Editor.

**Files:** `docs/specs/2026-10-19-resident-meeting-notices.sql`

### OA-3 · Correct payment plans that count the balance twice

**Done:** 2026-10-20 (owner ran the SQL runbook; Claude verified each check)

**Urgency:** Soon

**Why it matters:** payment plans created before 2026-10-19 counted the
owner's balance twice. Balances, estoppel letters, collections letters and
board reports for those owners show too much money owed. The code is fixed;
the old records still need correcting.

**Steps:**

1. Open `docs/specs/2026-10-19-payment-plan-double-count.sql`.
2. Run **Part 1** and **Part 2**. They only read and show you what would change.
3. Read **Part 3**. It ends in `ROLLBACK`, so running it as-is changes nothing: it is a rehearsal. Run it once like that.
4. If the numbers look right, change the last `ROLLBACK` to `COMMIT` and run Part 3 again. Ask Claude to check the numbers with you first if you are unsure.

**Files:** `docs/specs/2026-10-19-payment-plan-double-count.sql`

### OA-4 · Add the speed-up indexes

**Done:** 2026-10-20 (owner ran the SQL runbook; Claude verified each check)

**Urgency:** Soon

**Why it matters:** these make the busiest board and resident pages load
faster. Nothing breaks without them; pages are just slower as data grows.

**Steps:**

1. Open `docs/specs/2026-10-19-perf-indexes.sql`.
2. Run each of the 12 `CREATE INDEX CONCURRENTLY` statements **one at a time**, each as its own query. Do not run the file as one block: these statements refuse to run together.

**Files:** `docs/specs/2026-10-19-perf-indexes.sql`

### OA-17 · Turn on the inbox's "Unverified sender" check

**Done:** 2026-10-20 (owner ran the SQL runbook; Claude verified each check)

**Urgency:** Whenever

**Why it matters:** anyone can fake the "From" address on an email. The inbox can now spot emails that fail Gmail's sender checks (SPF, DKIM, DMARC) and flag them as "Unverified sender", so the board never updates contact details or shares a balance in reply to an impostor. It needs one new database column first.

**Steps:**

1. Do OA-1 first (0063 and M1).
2. Open `docs/specs/2026-10-20-inbound-auth.sql`. Run the pre-check, then the apply step, then the verify step, each on its own. Send Claude the verify counts.
3. Tell Claude it's done. Claude switches the check on (`SENDER_AUTH_COLUMN_LIVE`) and deploys.

**Files:** `docs/specs/2026-10-20-inbound-auth.sql`

### OA-21 · Lock text-message consent to the resident themself

**Done:** 2026-10-20 (owner ran the SQL runbook; Claude verified each check)

**Urgency:** Soon

**Why it matters:** residents now agree to texts themselves (Account → Text messages), and the app never lets a board member do it for them. One gap remains at the database level: a board member with technical skills could still flip a resident's "texts on" setting directly. This SQL adds a guard so only the resident can turn their own texts on. Texting consent rules are strict, so close the gap before texting goes live (OA-11).

**Steps:**

1. Open `docs/specs/2026-10-20-sms-consent.sql`.
2. Run the pre-check, then the apply section, then the verify section, each on its own. Send Claude the verify output.

**Files:** `docs/specs/2026-10-20-sms-consent.sql`



## For Claude: keeping this file current

- **A new manual step appears** (a migration to apply, a dashboard setting, a key, DNS): append it to **Open** in the same session, with the next free id (never reuse one), an urgency, why it matters, exact steps and the repo paths to use. Never inline a secret or another person's details; the repo is public.
- **Asaf says a step is done:** move the whole item, unchanged, to **Done**, and add `**Done:** YYYY-MM-DD` under its title.
- Keep the format: `### OA-<n> · <title>`, then a `**Urgency:** Urgent|Soon|Whenever` line. `scripts/owner-actions/send.ts` parses it and fails loudly on a malformed item; the unit tests also check this file.
- Preview the email: `pnpm exec tsx scripts/owner-actions/send.ts --dry-run --out /tmp/owner-actions.html`.
