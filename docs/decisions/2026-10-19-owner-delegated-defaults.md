# Owner-delegated defaults (2026-10-19)

Asaf, 2026-10-19: "you don't need to ask or wait for any update from me — all should go based on best practices and your recommendation… if you need to consult with someone you can use opus 5.5 as advisor."

These were the open questions. Each one is now decided as below; the owner can change any of them later.

| Question | Decision | Why |
|---|---|---|
| **Bulk texts before an SMS consent record exists (B3)** | Texts go only to residents with `sms_opt_in = true`. Routine messages never go by text. | TCPA consent requirements; it is the conservative default. |
| **Spanish version** | Offered once a board has used it at least once. It is not on by default for every HOA. | Avoids AI translation cost and review effort where nobody needs it. |
| **"Linda, Madison Park" quote** | Removed everywhere until a real, written-permission customer quote exists. | No record shows the quote is real, and the design docs use "Linda" as a persona. Honesty rule (docs/decisions/2026-10-18-marketing-pricing-truth.md). |
| **Legal entity "HomeownerHub, Inc."** | The footer and terms say "HomeownerHub" with no "Inc." until the entity is confirmed. | Don't state a legal form that hasn't been verified. |
| **`@ledger.ai` addresses on marketing** | Replaced with `support@homeownerledger.com`. | It is our domain. Resend can't send from ledger.ai. |
| **Resident assistant default** | OFF until the board turns it on. See 2026-10-19-resident-assistant-default.md. | Fails closed while 0063 is unapplied. |
| **Pricing compared with PayHOA** | Checkout price unchanged for now. The investor deck shows both $4.99/door and BL-068 module pricing. Next step: an advisor-reviewed pricing analysis (BL-001 refresh). | A price change affects live checkout and needs data first. |
| **Stripe product name "HOA Hub"** | Waits for the Stripe dashboard rename. The code changes together with that rename. | Renaming only in code creates a duplicate product. |
| **Domain split steps for Asaf** (DNS CNAME, Supabase, Google, webhooks, marketing git link) | These remain manual-only steps under the standing rule (accounts only Asaf controls). Everything else proceeds without waiting. | We have no credentials for those dashboards. |
