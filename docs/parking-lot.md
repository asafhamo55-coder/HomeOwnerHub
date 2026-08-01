# Parking Lot

Per Build Spec v1.1 §11 + §2.1: items we will be tempted to build but should
NOT in v1 land here. Add the date, the temptation, and the reason it stays
parked.

## Format

```
- YYYY-MM-DD — <thing> — <why parked> — <revisit trigger>
```

## Items

- 2026-05-09 — **Custom mobile native apps (iOS/Android)** — Spec §11. PWA is
  enough for v1. Revisit if Madison Park residents complain about install
  friction during the first quarter on platform.
- 2026-05-09 — **Vendor marketplace** — Spec §11. Vendor master per
  organization is enough. Revisit when ≥ 5 CAMs ask for it.
- 2026-05-09 — **Insurance integrations** — Spec §11. Out of scope.
- 2026-05-09 — **Resident social features** (forums, polls) — Spec §11. Out
  of scope.
- 2026-05-09 — **Multi-language UI** — Spec §11. English only for v1.
- 2026-05-09 — **White-glove migration tooling** beyond CSV import — Spec §11.
  Manual onboarding for first 20 customers.
- 2026-05-09 — **Granular permission editor** — Spec §11. 5 fixed roles only.
- 2026-05-09 — **Custom report builder** — Spec §11. 12 fixed reports + CSV
  export.
- 2026-05-09 — **Stripe Connect platform model** — ADR-001. Direct accounts
  through month 3, switch when first CAM signs.
- 2026-05-09 — **Self-hosted Langfuse** — ADR-001. Setup deferred to month 2
  alongside the `defineWorkflow` primitive's audit logger.
- 2026-05-09 — **Vision model in W3 / W4** — ADR-002. Text-only first
  iteration; vision in 2.1 cutover to self-hosted.
- 2026-05-09 — **Voice concierge (W2 v1.2)** — ADR-002. Whisper + Piper
  deferred to 2.1.
- 2026-05-09 — **GitHub repo rename to `homeowner-portal`** — ADR-001. Internal
  package namespace renamed; repo rename deferred (GitHub redirects from old
  name handle the transition gracefully).

## v1.1 additions (spec §5 deferred workflows + §2.1 substitutions)

- 2026-05-13 — **W10 (defunct)** — Merged into W23 (Bid Normalizer &
  Comparator). Do not resurrect.
- 2026-05-13 — **W17 AI Settlement Negotiator** — Spec §5. Lower-leverage
  than other eviction flows; defer to v1.5. Revisit after W14 + W15 are
  in production for ≥ 60 days.
- 2026-05-13 — **W19 AI Anomaly & Fraud Detection** — Spec §5. Needs
  trailing-12-month transaction data we won't have. Revisit when
  Madison Park completes a full fiscal year on the platform.
- 2026-05-13 — **W20 AI Budget Variance Narrator** — Spec §5. Needs
  full fiscal-year data. Revisit at the same time as W19.
- 2026-05-13 — **W24 AI Reference Caller (voice)** — Spec §5 + §17.
  Voice infrastructure (Twilio paid + Whisper/Piper routing) deferred
  with the rest of v1.5 voice.
- 2026-05-13 — **W25 AI COI Renewal Sentinel (deep)** — Spec §5. Basic
  COI expiration tracking lives in `vendor_compliance.coi_expiration_date`;
  the deep workflow (auto-renewal nudge cycles, carrier-side
  integrations) is v1.5. Partner-vs-build decision: month 6.
- 2026-05-13 — **W26 AI Vendor Performance Analyzer** — Spec §5. Needs
  historical work-order outcomes we don't have. Revisit after one full
  Madison Park year.
- 2026-05-13 — **W27 Vendor Intelligence Aggregator** — Spec §5. Pulls
  from Google Places / Foursquare / state-license APIs; Google Places
  removed its free tier Feb 2025 (~$275/mo minimum). Defer until paying
  customers fund it. **Per spec §14.6 antitrust posture: ANY future
  cross-tenant feature requires attorney review ($3K–$5K) before
  implementation.**

### Zero-cost-tier substitutions (ADR-004)

- 2026-05-13 — **Twilio SMS + voice in v1** — Spec §17 + ADR-004. No
  usable production free tier. Email + in-portal chat cover the design-
  partner phase. Revisit for v1.5 alongside Telnyx / self-hosted SIP
  options.
- 2026-05-13 — **Google Places API for vendor enrichment** — ADR-004.
  Free tier removed Feb 2025. v1 vendor module is manual-entry only.
  `vendor_external_data` table exists in migration 0007 but is unused
  in v1.
- 2026-05-13 — **Lambda / RunPod GPU host during build phase** —
  ADR-004 + ADR-002. Use Asaf's existing GPU; rent only at customer-
  demo / production cutover time.
- 2026-05-13 — **White-glove migration tooling** — Spec §2.1 + §11.
  CSV import + manual SQL for the first 10 customers. Founder-led
  onboarding is the v1 GTM.
- 2026-05-13 — **Reserve study comparison data (W9)** — Spec §5 + §2.1.
  No free public dataset. Build the W9 framework; populate data later.
- 2026-05-13 — **Migrate `packages/jobs/` from Inngest → `pg-boss`** —
  ADR-001 open item, ADR-004 substitution. Inngest free tier covers
  Phase 1 cron jobs today; pg-boss migration is a v1 build task, target
  month 2. Tracked here so it doesn't fall off the radar.

### v1.1 payment / vendor specifics (spec §16, §14)

- 2026-05-13 — **Direct Zelle API integration** — ADR-005. Does not
  exist for non-bank entities. The Pay-by-Zelle assisted flow (W18
  reconciliation) is the v1 answer; this is permanently parked, not
  deferred.
- 2026-05-13 — **Direct Venmo personal-account API for merchant
  payments** — ADR-005. Explicitly forbidden by Venmo ToS.
  Permanently parked.
- 2026-05-13 — **Venmo for Business in v1** — ADR-005. Requires
  per-association PayPal Business onboarding; operational complexity
  not justified for the design-partner phase. Revisit in v1.5 once ≥ 3
  residents request it.
- 2026-05-13 — **Cash App for businesses** — ADR-005. No production
  API. Permanently parked.
- 2026-05-13 — **Cross-tenant vendor reviews / shared directory /
  "average price for landscaping in 30022" feature** — Spec §14.6.
  Permanently parked due to antitrust risk. The line we do not cross.
- 2026-05-13 — **Persistent vendor accounts** — Spec §18 open #4. v1
  uses tokenized one-time submission links via
  `rfp_invitations.unique_submission_token`. Persistent accounts may
  land in v1.5; revisit when the third CAM customer asks for vendor
  self-service portals.
- 2026-05-13 — **CAM-friendly ACH (Heritage Bank / Alliance Association
  Bank)** — Spec §18 open #6 + ADR-005. Stripe is sufficient for the
  design-partner phase. Revisit when first CAM signs.

### Extract `packages/inbox` from `apps/hoa/src/lib/inbox`

`packages/jobs/src/mailbox-{sync,backfill,attachments}.ts` import
`ingest.ts` and `match.ts` from `apps/hoa` by relative path. It resolves and
bundles correctly, but a package reaching into an app is backwards.

Fix: move `ingest.ts`, `match.ts`, `properties/resolve.ts`, and
`properties/normalize-address.ts` into a `packages/inbox` workspace package;
both `apps/hoa` and `packages/jobs` then import it normally. Mechanical —
the modules already have no Next-specific imports, which is why the move is
safe to defer rather than dangerous.

Deferred because doing it before Phase A was proven meant moving files that
were still changing every task.
