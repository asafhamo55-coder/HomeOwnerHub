# Parking Lot

Per Build Spec v1.0 §11: items we will be tempted to build but should NOT in
v1 land here. Add the date, the temptation, and the reason it stays parked.

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
