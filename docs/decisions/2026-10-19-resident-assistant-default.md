# 2026-10-19 — Resident assistant is off until the board turns it on

**Date:** 2026-10-19 · **Status:** Accepted (security review of BL-096, finding SEC-002) · **No migrations.** The owner may revisit this once migration 0063 is applied.

## Decision

The association's **Resident assistant** switch (`associations.compliance_settings.resident_assistant`) now **fails closed**. The resident portal treats the assistant as on only when the stored value was written by the board's signed save and says ON. Anything else reads as **OFF**:

- no value at all (the board never saved the switch);
- a value with the wrong shape;
- a value whose HMAC doesn't verify (written outside the board's save, or the signing secret is gone).

`residentAssistantOn()` in `apps/hoa/src/lib/resident-assistant/settings.ts` makes this choice. OFF only means residents get Ask the Docs, the single-question docs search they had before BL-096.

## Why

The reason is security. Until migration 0063 is applied, any org member's own session can write `associations.compliance_settings`, and that includes a resident's JWT. The HMAC stops a resident from forging an ON. Under the old rule, though, a *missing* value read as ON. A resident could delete the key and switch the assistant back on after the board had switched it off. If missing reads as OFF, deleting the key can only turn the assistant off, and that is the safe direction.

## Keeping the product intent

The product intent was "on by default for boards". We now meet it without writing anything for the board:

- Settings → Notifications shows a never-saved switch as **OFF** with a short **Recommended: turn on** hint. The hint goes away once the board saves the switch either way.
- Nothing is auto-written. Turning the assistant on is always a board member's own signed save.
- Each association in the org has its own switch (SEC-003), so a board with several associations turns each one on separately.

The guide articles `resident/resident-assistant.md` and `settings/settings-notifications.md` now say the board turns the assistant on.

## Revisiting

Once 0063 is applied and residents can no longer write `compliance_settings`, the owner may restore "missing reads ON". To do that, change `residentAssistantOn()` back, update `settings.test.ts` ("missing → OFF"), and remove the hint and the guide wording above. A forged or unverifiable value must still read OFF.
