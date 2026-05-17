# W23 — Bid Normalizer & Comparator

**Purpose:** 2–5 incoming bids in different formats → AI extracts line items, normalizes line items across vendors, flags hidden exclusions, payment-term + warranty differences, and produces a board recommendation memo.

The workflow that turns "three PDFs in three different layouts" into "a one-page decision document."

## Public API

```ts
import { bidComparator } from '@homeowner-portal/workflows/W23'

const { output, runId } = await bidComparator.execute(
  { rfpId },
  { organizationId },
)
```

The workflow reads all `bids` (status `submitted`) tied to the RFP, runs vision + LLM normalization, and upserts the resulting `bid_comparisons` row. The board reviews and selects — **the workflow does not select**.

## Pipeline (spec §5 W23, replaces v1.0 W10)

1. **Per-bid extraction.** Vision + LLM extracts each bid PDF into structured form: line items, unit prices, quantities, totals, payment terms, warranty, exclusions, additions, timeline commitments. Writes the result to `bid_line_items` (existing rows are upserted).
2. **Cross-bid line alignment.** LLM aligns line items semantically: "Vendor A's 'spring cleanup' = Vendor B's 'pre-season prep' = Vendor C's 'opening visit'." The mapping lives in `bid_comparisons.comparison_table`.
3. **Flag**:
   - Hidden exclusions (Vendor A excludes leaf removal; Vendors B and C include)
   - Scope gaps (Vendor B doesn't bid on irrigation winterization that the RFP requested)
   - Payment-term differences
   - Warranty differences
   - Insurance-compliance status (cross-references W21 data per vendor)
4. **Write recommendation memo.** Plain-English summary the board reads. The memo names trade-offs explicitly; it does NOT pick a winner.

## Inputs / Outputs

| Field | Schema |
|---|---|
| Input.rfpId | `uuid` |
| Output.comparisonTable | normalized line-items × bids matrix (jsonb) |
| Output.flaggedExclusions | `{ bidId, line, detail }[]` |
| Output.flaggedAdditions | `{ bidId, line, detail }[]` |
| Output.paymentTermDiffs | per-bid summary |
| Output.warrantyDiffs | per-bid summary |
| Output.recommendationMemo | `string` (the one-page memo) |
| Output.confidence | `'HIGH' \| 'MEDIUM' \| 'LOW'` |

## Acceptance (spec §5 W23)

- [ ] 3 real or synthetic landscape bids fed in; comparison table aligns ≥ 90% of line items correctly.
- [ ] ≥ 1 real-world hidden exclusion correctly flagged.
- [ ] Board can read the memo and reach a decision in ≤ 10 minutes.

## Open work to hit acceptance

- [ ] Vision extraction step — same dependency as W21, awaits ADR-002 Phase 2.1 cutover. Until then, text-only fallback: vendors paste their line items into a structured form when submitting.
- [ ] Fixture set: 3 landscape bid PDFs (real Madison Park bids or synthetic generator) for the eval suite.
- [ ] Manager-side UI for the comparison table — lives in `apps/hoa/src/app/(dashboard)/vendors/rfps/[id]/compare/page.tsx`, not in this package.

## Antitrust posture

Per spec §14.6: this workflow operates entirely inside the originating organization. `bid_comparisons.comparison_table` and `bids.total_amount` are never aggregated across organizations or surfaced as benchmarks. No "average landscaping cost per 30022" feature exists or will exist.

## Versions

| Version | Changed | Notes |
|---|---|---|
| 0.1.0 (prompt 1.0.0) | initial | Skeleton; replaces v1.0 W10 per spec §5. |
