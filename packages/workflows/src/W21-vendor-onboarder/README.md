# W21 — Vendor Onboarder

**Purpose:** Vendor uploads COI, W-9, and license; AI extracts structured data, validates against the association's compliance requirements, and produces a color-coded status.

The workflow that makes Module 7 (Vendor Management) feel turnkey for a self-managed board.

## Public API

```ts
import { vendorOnboarder } from '@homeowner-portal/workflows/W21'

const { output, runId } = await vendorOnboarder.execute(
  { vendorId, associationId, documents: [{ docType: 'coi', storagePath }, ...] },
  { organizationId },
)
```

`output.complianceStatus` is one of `green`, `yellow`, `red`, `missing`. The workflow upserts a `vendor_compliance` row keyed on `(vendor_id, association_id)`. It does NOT change `vendors.status` — the board approves that transition (manager-side action on the queue).

## Pipeline (spec §5 W21)

1. **Vision/OCR extract.** For each uploaded document, call the vision model:
   - **COI (ACORD 25):** insurance carrier, policy number, effective + expiration dates, coverage limits (per-occurrence GL, aggregate GL, auto, umbrella, workers' comp), additional-insured language.
   - **W-9:** legal name, EIN/SSN (masked except last 4), address, business classification.
   - **License:** license number, state, trade, expiry, status.
2. **Validate** each against the association's `compliance_settings` (insurance minima, workers' comp required, additional-insured language required).
3. **Compose deficiency list.** Specific gaps with cite-worthy detail:
   - "Workers' comp policy expired 03/15/2026 — needs renewal"
   - "General liability $500K but association requires $1M"
4. **Status:** green (compliant), yellow (expiring ≤ 30 days or minor gap), red (non-compliant), missing (one or more required docs absent).
5. **Notify vendor of deficiencies** via email with a re-upload link (tokenized; same mechanism as RFP invitations).

## Human-in-loop

Manager approves green → moves `vendors.status` to `active`. Yellow / red lands in the manager queue. The workflow itself never flips vendor status.

## Inputs / Outputs

| Field | Schema |
|---|---|
| Input.vendorId | `uuid` |
| Input.associationId | `uuid` (compliance is per-association) |
| Input.documents | `{ docType: 'coi'\|'w9'\|'license', storagePath: string }[]` |
| Output.complianceStatus | `'green' \| 'yellow' \| 'red' \| 'missing'` |
| Output.deficiencies | `{ code, severity, detail }[]` |
| Output.extracted | per-doc structured payload |
| Output.confidence | `number` (0..1) |

## Acceptance (spec §5 W21)

- [ ] 10 sample COI PDFs (real or synthetic ACORD 25): all key fields extracted at ≥ 95% accuracy.
- [ ] Madison Park's actual 5 active vendors onboard end-to-end without manual data entry beyond document upload.

## Open work to hit acceptance

- [ ] Migration 0007 applied; `vendor_compliance` table exists.
- [ ] Vision model wiring — Qwen2-VL 7B via vLLM per ADR-002 Phase 2.1. Until cutover, text-only fallback: vendor types the COI fields into a form and W21 just validates (no OCR).
- [ ] Per-association `compliance_settings` (insurance minima) — lives on `associations` as a `jsonb` column; add when the manager UI for it lands.
- [ ] Tokenized re-upload link flow — shares the `unique_submission_token` mechanism with `rfp_invitations`.

## Versions

| Version | Changed | Notes |
|---|---|---|
| 0.1.0 (prompt 1.0.0) | initial | Skeleton; vision step deferred to Phase 2.1 per ADR-002. |
| 0.2.0 (prompt 1.0.0) | text-only path live | Validation half wired against `associations.compliance_settings` (migration 0008). Caller passes `manualExtract`; W21 grades + upserts `vendor_compliance`. Vision still deferred to Phase 2.1. |
