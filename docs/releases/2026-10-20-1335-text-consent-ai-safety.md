---
title: Texts only to numbers residents agreed for, and an off switch for all AI
shots:
  - route: /resident/account
    caption: The resident's Account page, with Text messages
  - route: /settings/billing
    caption: Billing settings
---

## Summary

Text messages now go only to the exact phone number a resident agreed for. If the number changes, the resident is asked to agree again. Every AI feature in the app can now be paused with one switch, and AI use that was previously uncounted is now metered against the same fair-use limits.

## What's new

### Text messages
- **Consent follows the number:** a resident's agreement covers the phone number they agreed with. If that number changes, texts stop and their Account page asks them to agree again. Older opt-ins with no consent record are asked to agree too.
- **Event alerts fixed:** recurring-event alerts used to text any phone number on file, even without an opt-in. They now follow the same consent rule as everything else.
- **Replying STOP or START** (coming): built and switched off until texting is set up with Vonage (owner actions OA-11 and OA-23).

### AI safety
- **One off switch for all AI:** if anything ever goes wrong, every AI feature, including background jobs, can be paused at once with a friendly "AI is paused" message.
- **Fair use everywhere:** "Draft a reply" in the inbox and eight board tools (vendor drafts and checks, state-law questions, bids and requests for proposal, budget summary, bank reconciliation) now count toward the same daily board AI limit as the rest. That limit is far above normal use, and nothing changes for typical boards.
- **Cost visibility:** AI use by background jobs is now counted in the daily cost check.

### Faster pages
- **Dashboard, inbox, accounting, dues and resident pages** load faster: data that doesn't depend on other data now loads at the same time, and a few repeated lookups were removed. Nothing shown on the pages changed.
- **Fixed:** opening Dues for a single home always showed no charges. It now shows that home's charges.

### Faster search
- **⌘K search is quicker:** lookups that don't depend on each other now run at the same time, cutting a search to two database round-trips. Each search now reports its timings so slow spots show up.

### Usage analytics (off until you turn it on)
- **Privacy-safe usage numbers:** page views and 8 named actions (such as "approval decided"), with no cookies, no names, no emails and no text. Record ids are stripped from addresses, and Do Not Track is honoured. It records nothing until you switch it on (owner action OA-24).

### Behind the scenes (not visible yet)
- **New pricing plans:** the nightly door-count check, the 30-day renewal notice for current subscribers, and a monthly text allowance per plan are built. They stay off until the new pricing is switched on.

## Good to know
- No one has checked these screens in a browser yet. If you have a test resident account, open Account → Text messages once.
