# BL-147: no late fee without a board policy

**Date:** 2026-10-21. **Decided by:** the autonomous loop (Asaf's standing "decide, then record" rule).

## What the live job did before

`packages/jobs/src/hoa-late-fees.ts` (Inngest `hoa-late-fees`, midnight Eastern) did this every night for every HOA association with seeded accounting:

- **Which charges:** every `assessments` row with status `open` or `partial`, `due_date` before the association's today, and any type except `late_fee`. That includes `fine`, `collection_legal`, `collection_letter`, `collection_processing` and `lien_filing`. It also included payment-plan installments, and soft-deleted rows, because there was no `deleted_at` filter. Only opening balances (BL-136) were skipped.
- **How much:** a hard-coded `HOA_LATE_FEE_RATE = 0.05`, applied to the charge's full original `amount`, even when the charge was partly paid.
- **Limits:** no grace period, no board setting, no state cap, and no check that the declaration allows a late charge.
- **Posting:** each fee became an open `late_fee` resident charge plus a Dr AR / Cr Late Fee Income journal entry, posted automatically with no approval, audit row or board notice.
- **Repeats:** once per charge (memo `LATE-<id>`).

This conflicted with the product rule that nothing posts without a board decision. In Georgia it was also unlawful wherever the declaration doesn't provide for a late charge: O.C.G.A. § 44-3-232(b) allows one only "to the extent that the instrument provides". It could also exceed "the greater of $10.00 or 10 percent" there, and in Florida, where § 720.3085(3)(a) caps it at "the greater of $25 or 5 percent".

## Decision 1: the safe default is no late fee

An association with no saved, signature-verified late-fee policy is charged **nothing**. The job doesn't even read its charges. The same applies when a saved policy:

- is off;
- has no declaration attestation;
- is unsigned or tampered with;
- is outside the state rule on the night it runs.

This departs from the backlog's "existing associations keep today's 5% until the board saves a policy". That transition would keep charging fees nobody chose, possibly unlawfully, until a board noticed. A missing late fee is easy to recover. The board turns the policy on, and charges still unpaid get their fee that night, since the job is idempotent per charge. A wrongful late fee becomes a dispute, and in Georgia it can grow into a lien.

**Consequence:** from the deploy that ships BL-147, no association gets new late fees until its board saves a policy at **Settings → Late fees**. Fees already charged stay on the books. Boards should be told in the release note.

## Decision 2: charge only under an explicit, attested policy, not per-fee approvals

**What already happens.** Every late fee is a `late_fee` row in `assessments`, so it already shows as a resident charge on the property ledger, the resident portal and AR. The board can see each one after it posts. BL-126 / Approvals (`approval_requests`, executed by `packages/workflows` on approve) is for one-off postings that need a person to check the numbers: deposits, bills, opening balances and collections letters.

**Options considered:**

1. **The job proposes each night's fees through /approvals.** The board approves a batch, then they post.
2. **The job charges only under a policy the board explicitly adopted**, with an audit row and a digest line.

**Chosen: option 2.** Best practice in HOA management is a board-adopted collection policy that applies late fees automatically and uniformly. Approving fees one by one is the selective-enforcement risk that uniform policies exist to prevent. It would also put a recurring, rubber-stamp queue in /approvals every night, which trains boards to click Approve without reading.

The board decision the product rule requires is the policy itself. A board member saves it, attests the declaration provides for a late charge, names where, and the save is HMAC-signed and audited (`late_fee_policy.saved`: enums and numbers only).

**Each night's charges stay visible:**

- an audit row `late_fee.nightly_charged` per association, with counts, total cents, the day and the policy's save time (no addresses, names or charge details);
- a line in the board's morning email: "N late fees charged overnight under your late-fee policy ($X in total)", linking to the policy.

## Caps and rules (quoted from `scripts/fixtures/state-law/`, checked by `law.test.ts`)

- **GA, § 44-3-232(b)(1):** only if the instrument provides. At most the greater of $10.00 or 10%.
- **FL, § 720.3085(3)(a):** only if the declaration or bylaws provide. At most the greater of $25 or 5%.
- **CA, Civ. Code § 5650(b):** delinquent 15 days after due. At most the greater of $10 or 10%.
- **TX and every other state:** no rule loaded. The screen says "check your governing documents", and no cap applies beyond the board's own.

**How the caps are enforced:**

- **At save:** a percent above the state percent is refused, as is a CA grace period under 15 days, and the attestation is required to turn the policy on.
- **Each night:** the job re-checks the saved policy against the association's current state (`governing_law_state`, else `state`) and charges nothing if it fails. It cuts every fee to the greater-of cap on that charge.
- **The base:** the percent and the cap are taken of the amount still unpaid, which is never more than the statute's base.

**Other rules:**

- Fines are excluded by default.
- Late fees, collection costs and lien fees never get a late fee.
- One fee per charge.

## Follow-ups (not built here)

- **TX § 209.0062(a):** an owner on an alternative payment schedule may pay "without accruing additional monetary penalties". Payment-plan installments are `special` rows, indistinguishable from other special assessments in the job. Exclude them for TX once installments carry a marker.
- **GA § 44-3-232(b)(2):** the 10% a year interest cap on the collections letter (BL-148).
- **A dashboard prompt** for boards that had late fees before BL-147 and now have none.
- **GA condominiums (Condo Act, § 44-3-109)** are not in the fixtures. They read as "check your governing documents" only if their state is not GA. Today they get the POA Act cap.
