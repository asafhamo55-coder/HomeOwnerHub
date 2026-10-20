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

### OA-1 · Apply database migrations 0063, then M1

**Urgency:** Urgent

**Why it matters:** until the M1 batch (migration 0064) is applied, Stripe's
"subscription changed" messages fail to save, so an HOA that pays stays on
the Free plan. Stripe retries each message for 3 days, so customers who pay
in the meantime can still be fixed, but only for those 3 days. 0063 must go
first: it closes the security gaps in who can see which records, and M1
refuses to run without it.

**Steps:**

1. Open `docs/specs/2026-10-16-rls-sweep-apply.sql` (migration 0063).
2. Run **PART 1a** on its own. Save the result (copy as CSV or screenshot) and send it to Claude. It is the undo reference.
3. Run **PART 1b**, then **PART 2** (one block, paste it whole), then **PART 3**, one at a time. Use the parts as they are in the file now, not an older copy.
4. Open `docs/specs/2026-10-18-m1-apply.sql` (M1, migration 0064).
5. Run **PART 1**, then **PART 2** (one block, paste it whole), then **PART 3**. If anything in PART 2 fails, the whole thing undoes itself; send Claude the error.
6. Tell Claude "M1 is applied". Claude switches the new features on (`M1_APPLIED` in `packages/db/src/m1.ts`) and deploys.

**Files:** `docs/specs/2026-10-16-rls-sweep-apply.sql`, `docs/specs/2026-10-18-m1-apply.sql`

### OA-2 · Show the resident "Meetings and notices" page

**Urgency:** Soon

**Why it matters:** the resident meetings page is built and deployed, but it
stays hidden until this small database function exists. No deploy is needed
afterwards; the page appears on its own.

**Steps:**

1. Do OA-1 first (0063 and M1).
2. Run the whole of `docs/specs/2026-10-19-resident-meeting-notices.sql` in the SQL Editor.

**Files:** `docs/specs/2026-10-19-resident-meeting-notices.sql`

### OA-3 · Correct payment plans that count the balance twice

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

**Urgency:** Soon

**Why it matters:** these make the busiest board and resident pages load
faster. Nothing breaks without them; pages are just slower as data grows.

**Steps:**

1. Open `docs/specs/2026-10-19-perf-indexes.sql`.
2. Run each of the 12 `CREATE INDEX CONCURRENTLY` statements **one at a time**, each as its own query. Do not run the file as one block: these statements refuse to run together.

**Files:** `docs/specs/2026-10-19-perf-indexes.sql`

### OA-5 · Move the app to app.homeownerledger.com

**Urgency:** Soon

**Why it matters:** this splits the marketing site from the app. The
marketing site has not deployed in about 148 days because its Vercel project
is not connected to GitHub. Step 1 (adding the new address to Vercel) is
already done.

**Steps:**

1. **DNS (Network Solutions):** add a CNAME record: name `app`, value `afa3394a804e31cd.vercel-dns-017.com.`
2. **Supabase:** Authentication → URL Configuration → add `https://app.homeownerledger.com/**` to Redirect URLs.
3. **Google Cloud (OAuth client):** add the redirect URI `https://app.homeownerledger.com/api/oauth/google/callback`.
4. **Webhooks:** change the Stripe, Resend and Plaid webhook addresses to the `app.` host, then re-sync the app in Inngest.
5. **Vercel:** connect the `homeownerhub-marketing` project to GitHub (production branch, root directory `apps/marketing`).
6. Tell Claude these are done. Claude runs the rest of the runbook (steps 3 to 7).

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

### OA-9 · Turn on the first Florida state-law refresh

**Urgency:** Whenever

**Why it matters:** production has no Florida statutes loaded yet, so the AI
cannot cite Florida law until this runs once.

**Steps:**

1. Sign in to the app as the platform admin.
2. Open the browser's developer console on any app page and run `fetch('/api/admin/refresh-state-law',{method:'POST'})`.

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

### OA-17 · Turn on the inbox's "Unverified sender" check

**Urgency:** Whenever

**Why it matters:** anyone can fake the "From" address on an email. The inbox can now spot emails that fail Gmail's sender checks (SPF, DKIM, DMARC) and flag them as "Unverified sender", so the board never updates contact details or shares a balance in reply to an impostor. It needs one new database column first.

**Steps:**

1. Do OA-1 first (0063 and M1).
2. Open `docs/specs/2026-10-20-inbound-auth.sql`. Run the pre-check, then the apply step, then the verify step, each on its own. Send Claude the verify counts.
3. Tell Claude it's done. Claude switches the check on (`SENDER_AUTH_COLUMN_LIVE`) and deploys.

**Files:** `docs/specs/2026-10-20-inbound-auth.sql`

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

## Done

_Nothing yet. Finished items move here with the date they were done._

## For Claude: keeping this file current

- **A new manual step appears** (a migration to apply, a dashboard setting, a key, DNS): append it to **Open** in the same session, with the next free id (never reuse one), an urgency, why it matters, exact steps and the repo paths to use. Never inline a secret or another person's details; the repo is public.
- **Asaf says a step is done:** move the whole item, unchanged, to **Done**, and add `**Done:** YYYY-MM-DD` under its title.
- Keep the format: `### OA-<n> · <title>`, then a `**Urgency:** Urgent|Soon|Whenever` line. `scripts/owner-actions/send.ts` parses it and fails loudly on a malformed item; the unit tests also check this file.
- Preview the email: `pnpm exec tsx scripts/owner-actions/send.ts --dry-run --out /tmp/owner-actions.html`.
