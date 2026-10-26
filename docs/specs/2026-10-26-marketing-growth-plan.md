# Marketing website: traffic and demo requests (Georgia first)

Owner ask (Asaf, 2026-10-26): "be very clear on how we bring traffic to this site and start getting requests for demos".

## Goal and numbers we watch

**Goal:** demo requests and free-pilot sign-ups from **self-managed Georgia HOA boards**.

**The funnel:**
1. Someone searches, or sees a post or referral.
2. They land on a Georgia page.
3. They click "Book a demo" or "Start free pilot".
4. The request lands in Asaf's inbox.
5. Asaf replies within 1 business day.

**Measured weekly:** visitors, the top landing pages, and how many people click "Book a demo" vs. actually submit the form, plus pilot sign-ups. No targets are invented here. The first two weeks set the baseline.

## Step 0: make sure a request can't be lost (found 2026-10-26)

The demo form emails Asaf through Resend, but the marketing Vercel project has **no environment variables**. Every request until now was logged and dropped while the visitor saw "success".
- **Fixed in code:** in production a missing key now shows "please email support@…" instead of a fake success.
- **OA-34 (Asaf):** add `RESEND_API_KEY`, `EMAIL_FROM` and `DEMO_INBOX_EMAIL` to the marketing project.
- **After OA-34:** Claude submits one test request and confirms it arrives.

## Why the timing is good

Georgia's SB 406 creates new obligations for every association:
- Secretary of State registration, a $100 yearly renewal and the officer-change filings.
- The attorney's-fee notice, in force since July 2026.
- The new foreclosure threshold and the owner complaint process, both from **Jan 1, 2027**.

Volunteer boards are searching for exactly these answers this quarter, and HomeownerHub already does each one. The message is: **"Get your HOA ready for SB 406 before January 1."**

## Channels, in order

| # | Channel | What we do | Owner | Cost |
|---|---|---|---|---|
| 1 | **Search (SEO)** | 6–8 plain-language Georgia guide pages for what boards search: "Georgia HOA registration 2027", "SB 406 attorney fees notice", "Georgia HOA foreclosure threshold", "Georgia HOA owner rights", "Georgia HOA late fee limit", "Georgia condo vs HOA law". Each quotes the official text and ends with a demo CTA. | Claude builds | $0 |
| 2 | **Free SB 406 readiness check** | A 10-question self-check on the site ("Are you registered? Do your letters include the 30-day fee notice?…"). It gives a score and a checklist, then offers "Book a 20-minute demo". | Claude builds | $0 |
| 3 | **Google Search Console and sitemap** | Verify the domain and submit the sitemap, so the guide pages get indexed quickly. | Asaf (OA-35), Claude adds the verification tag | $0 |
| 4 | **Communities** | Answer real questions in Georgia HOA Facebook groups, Nextdoor and r/HOA with links to the guides. Helpful posts, never spam. | Asaf posts; Claude drafts answers on request | time |
| 5 | **Professional referrals** | Georgia HOA attorneys and CPAs. Board members ask them "what software?" BL-168 gives them free seats on client associations. A short "for attorneys and CPAs" page. | Claude builds the page; Asaf makes the first 5–10 calls | time |
| 6 | **Webinar** | "SB 406 in 30 minutes for volunteer boards" in mid-November and early December. A sign-up form, then a recording page with a demo CTA. | Asaf presents; Claude builds the pages and slides | $0 |
| 7 | **Paid search (later)** | A small Google Ads test on the SB 406 terms, only once conversion tracking works. | Asaf decides the budget (suggest $300–500 for the first month) | paid |
| 8 | **Direct outreach (Asaf's call)** | A short, personal note to Georgia associations' registered contacts, which are public corporate records, a few a day. Must follow CAN-SPAM. | Asaf decides; Claude can draft | time |

## Site work (Claude, backlog BL-171)

1. **Measurement:** Vercel Web Analytics (cookieless; no consent banner needed), plus events for demo-button clicks, demo-form submits and pilot-start clicks. Turning analytics on in the project is OA-35.
2. **CTA:** a "Book a demo" button in the header and at the end of every page. The demo page is short (name, email, HOA, optional county and doors) and promises "we reply within 1 business day".
3. **Pages:** a `/georgia` landing hub, the 6–8 guide pages (official quotes only, plain language, a "not legal advice" note), and the readiness check.
4. **SEO basics:** a unique title and description per page, structured data (Organization, FAQ on the guides), internal links between the guides, fast pages (lazy-load the demo animation).
5. **Lead digest:** a weekly email to Asaf with visitors, top pages and demo/pilot counts. Analytics only, no personal data.

## Owner actions

- **OA-34:** add the email variables to the marketing project, so demo requests reach you.
- **OA-35:** enable Vercel Web Analytics on the marketing project, and verify the domain in Google Search Console.
- **Decide when ready:** a paid-search budget, and whether to do direct outreach.
