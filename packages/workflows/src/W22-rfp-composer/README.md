# W22 — RFP Composer

**Purpose:** Board describes a need in natural language; AI drafts a structured RFP using association context and CC&R-aware boundary information. Board reviews, edits, approves.

## Public API

```ts
import { rfpComposer } from '@homeowner-portal/workflows/W22'

const { output, runId } = await rfpComposer.execute(
  { associationId, freeTextNeed, budgetMin, budgetMax, deadline },
  { organizationId },
)
```

The workflow produces a structured RFP draft that is **never auto-published**. The board (or manager) approves it; on approval the API layer inserts the `rfps` + `rfp_line_items` rows and creates `rfp_invitations` for the selected vendors.

## Pipeline (spec §5 W22)

1. **Gather context**:
   - Free-text need description ("we need a new landscaper, current one is leaving end of month, want bi-weekly mowing + quarterly fertilization + leaf removal in fall").
   - Association context: total acreage in common areas, prior vendor scope if any, reserve component list (for boundaries), governing-doc context via W1.
   - Optional budget range.
2. **Draft via LLM**:
   - Scope with line items
   - Required qualifications (insurance limits, licensing, references — pulled from association compliance settings, not invented)
   - Timeline
   - Evaluation criteria
   - Submission instructions and deadline
   - Boilerplate (insurance requirements) from association settings
3. **Board reviews + edits + approves**. The approve action writes the `rfps` row from the draft (this workflow doesn't write the row itself).
4. **On approval**: `rfp_invitations` rows created for each invited vendor; vendors emailed a tokenized submission link.

## Inputs / Outputs

| Field | Schema |
|---|---|
| Input.associationId | `uuid` |
| Input.freeTextNeed | `string` (10–4000) |
| Input.budgetMin | `number \| null` |
| Input.budgetMax | `number \| null` |
| Input.submissionDeadline | `string` (ISO) |
| Output.title | `string` |
| Output.scope | `string` |
| Output.lineItems | `{ description, quantity?, unit?, notes? }[]` |
| Output.evaluationCriteria | `{ criterion, weight }[]` |
| Output.insuranceRequirements | shape derived from association compliance settings (NOT invented) |
| Output.confidence | `'HIGH' \| 'MEDIUM' \| 'LOW'` |

## Acceptance (spec §5 W22)

- [ ] Madison Park drafts an RFP for the next real vendor change; board approves with ≤ 3 edits.
- [ ] Generated RFP includes correct insurance requirements pulled from association settings (no hallucinated numbers).

## Open work to hit acceptance

- [ ] Per-association `compliance_settings` jsonb column on `associations` — needs to exist before W22 can pull insurance minima rather than guess.
- [ ] Reserve component list source — for landscaping/maintenance bids it constrains scope; lands when Madison Park's reserve study is uploaded (W9).
- [ ] Vendor-side submission form for tokenized invitations (`rfp_invitations.unique_submission_token`).

## Versions

| Version | Changed | Notes |
|---|---|---|
| 0.1.0 (prompt 1.0.0) | initial | Skeleton; insurance-requirements pull awaits compliance_settings column. |
