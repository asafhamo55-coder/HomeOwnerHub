# PayHOA gap analysis and competitive plan (2026-10-31)

Owner directive: PayHOA (payhoa.com) is the target. Shift the backlog to match its features and website. Sources were their public pages, review-site snippets and pricingsaas.com, all seen 2026-10-31. Our side was checked against the code at b07bfd78.

## PayHOA in one paragraph

PayHOA is all-in-one software for self-managed HOAs (also management companies and builders). It claims 6,000+ communities and 4.7 stars from about 1,000 reviews (Capterra 4.7/~586, GetApp 4.7/726). It has one plan with every feature, priced by unit count: $49/mo for 1-25 units, $59 for 26-50, $249 for 401-500, and $0.55/unit above 500. The trial is 30 days with no card, and data import is free. Card payments cost 3.5% + $0.50 and ACH costs $2.45; either can be passed to the owner. Mailed letters are $1.05-1.25. 1099s, tax filing and bookkeeping are paid add-ons. Since Oct 26, 2026 the "Gable" AI add-on is on by default, and costs $24.50/mo after 3 free months. Support is US-based, Mon-Fri 9-5 ET.

## Parity table

| Area | PayHOA | HomeownerHub |
|---|---|---|
| Online dues by card or ACH | Yes, core feature | **Missing** (Zelle with auto-match, and recorded checks) |
| Autopay | Yes, opt-in with a cap | **Missing** |
| Late fees, payment plans | Yes | Yes, with state caps |
| Lockbox | Yes (Western Alliance) | Missing |
| GL, bank sync, reconciliation, budgets | Yes | Yes, plus period close, CPA export and year-end packet. Plaid needs production approval |
| Bill pay and mailed checks | Yes, $2 per check | Missing |
| 1099 | Paid e-file | Candidate list only |
| Email | Yes | Yes |
| SMS | Unlimited | Built; blocked on Vonage (OA-11) |
| Voice calls | Yes | Missing |
| Mailed letters | Yes, Mail Room | Printable letters with tracking; no print-and-mail |
| Violations | Yes | Yes, plus hearings, fines, AI drafts and the resident cure path |
| Architectural review | Generic request form | Full ARC with decide-by deadline, decision letters and AI precheck |
| Work orders and tickets | Not visible | Yes |
| Documents | Yes | Yes, plus "Ask the Docs" with citations |
| Resident portal | Yes | Yes, as a PWA with push |
| Native app | Unclear; reviewers say it's missing | PWA only |
| Community website | Yes, builder | Missing |
| Voting and surveys | Yes | Paper election kit only; no surveys |
| Calendar | Yes | Yes, with .ics |
| Amenity reservations | Yes | Missing |
| Message boards | Yes | Missing |
| Collections | Not listed | Full ladder with legal clocks and certified-mail tracking |
| State-law compliance | Blog guides only | GA/FL/CA/TX law in the product: GA registration kit, SB 406 clocks, deadlines |
| AI | Gable: answers, tasks, autopilot replies (paid, default on) | Docs-grounded Q&A, violation and ARC analysis, inbox drafts, bill scan, vendor composer (included) |
| Trial and onboarding | 30 days, no card, free import, specialists | 30 days, no card, self-serve import, setup checklist; no populated demo |
| Support | Phone, chat and screenshare, weekdays | Email and in-app help only |
| Price | $49-$249+ by units, one plan | Essentials $49-$179 and Complete $99-$349 by band |

## How we win

1. **Close the sales blockers.** Online payments plus autopay (A2, A3) and a website that looks as trustworthy as theirs (A1). Without online payments, a PayHOA customer has no reason to switch.
2. **Lead with what they can't do.** Georgia law is built into the product, which matters now that SB 406 is signed and most of it starts Jan 1, 2027. We also have real ARC and collections workflows, and AI that cites your own documents and is included in the price, not a default-on upsell.
3. **Win on ease for older volunteers.** This is PayHOA's most praised trait. Our round 28 work (forgiving sign-in, confirmations, plain words) makes it a strength.
4. **Price simply.** Consider one plan with every feature, priced by size, so we're never above PayHOA at the same unit count. Owner decision (A5).
5. **Earn proof honestly.** Collect real board testimonials and reviews after launch. Never fake them.

## Owner actions this creates

- **OA-40:** finish Stripe activation (payout bank). This unblocks online payments.
- **Stripe Connect:** enable it, so each HOA gets its own connected account. Covered in the A2 design doc.
- **OA-11:** a Vonage account for SMS.
- **A5:** the pricing decision.
- **Real assets:** product screenshots from a demo community, and testimonials with written permission.
- **Optionally,** a support phone line or hours promise.
