# Terms of Service: HOA-only scope correction (BL-107)

- **Date:** 2026-10-20
- **Status:** Committed. Goes live with the next marketing deploy (BL-100).
- **Scope:** Wording only. No obligations, liability, fees, governing law, dispute terms or data terms were added, removed or changed.

## Why
The Terms page still described the service as covering small landlords and eviction-adjacent tasks. That wording dates from before the PM and Eviction hubs were hidden (BL-097). HomeownerHub now offers only HOA management, so the page described a service we do not offer.

## Before / after

### `apps/marketing/src/app/terms/page.tsx`

| Where | Before | After |
|---|---|---|
| Date line | `Last updated: May 15, 2026` | `Last updated: October 20, 2026` |
| Top of page | none | New "What changed on October 20, 2026" box listing the two edits below and stating that obligations, liability, fees, data terms, dispute terms and governing law are unchanged |
| §1 Service description | "HomeownerHub provides AI-assisted workflows for HOA boards, small landlords, and eviction-adjacent tasks. The service is provided as described on this site and in the product." | "HomeownerHub provides HOA management software, including AI-assisted workflows, for community associations and their residents. The service is provided as described on this site and in the product." |
| §2 Acceptable use | "...in accordance with applicable HOA, landlord-tenant, and consumer protection laws." | "...in accordance with applicable HOA and consumer protection laws." |

§3 to §8 (AI outputs, pricing and billing, your data, termination, liability, governing law) and the closing "working draft" note are byte-for-byte unchanged.

**Note on §2.** The lawful-use requirement ("only for lawful purposes") is unchanged and still covers all applicable law. Only the list of example laws lost its landlord-tenant entry, so no obligation was narrowed. If counsel prefers to keep the example, putting it back is a one-line change, but the new test would then need an allowance for it.

### `apps/marketing/src/app/privacy/page.tsx`
Unchanged. It has no landlord, eviction or tenant scope language. §1 lists "CC&R, bylaws, leases, etc." as examples of documents customers upload. Leases are kept because HOAs keep them on file for rental registration, and because this sentence describes data collection, which a scope correction must not touch.

### `apps/marketing/src/app/dpa/page.tsx`
Unchanged. It has no scope language. It is a request-the-DPA page.

## Guard
`apps/marketing/src/lib/marketing-truth.test.ts`:
- New `legal pages: HOA-only scope (BL-107)` block. Terms, Privacy and DPA must not contain landlord, evict, tenant, "property manag", rent roll/collection/payments, "PM Hub" or "Eviction Hub". The Terms must state the HOA scope and the new date. A self-test checks that the scan flags the old wording.
- Removed the Terms/Privacy exemption from the BL-097 scan, so the legal pages now pass the same no-landlord check as every other always-rendered page.
- Mutation check: putting back the old Terms text makes 5 tests fail.
