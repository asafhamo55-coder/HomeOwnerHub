# Text-message consent is tied to the phone number (BL-111)

- **Date:** 2026-10-20
- **Status:** Committed. Ships with the next HOA deploy. Needs no schema change.
- **Builds on:** BL-110, where residents agree to texts themselves (`apps/hoa/src/lib/sms-consent.ts`).

## Decision

A resident's agreement covers **the numbers they saw when they agreed**, and no others. Each send
texts a number only when all of these hold:

1. `resident_communication_preferences.sms_opt_in = true`. This is the BL-102 rule and is unchanged.
2. The resident's **latest unrevoked** `sms_consent_granted` audit row for that org lists the
   SHA-256 of the number's E.164 form in `metadata.phone_sha256`.

"Latest unrevoked" works like this. The resident's grant and revoke rows for the org are read in
time order:

- A grant replaces the set of covered numbers.
- An `sms_consent_revoked` row empties the set. Revoke rows come from the portal's "Stop text
  messages" button or an inbound STOP.

If the number on file changed after the resident agreed, the text is **skipped as "needs new
consent"**. It is counted like an opt-out (`optedOutCount`) and never as a failure.

- A scheduled send marks the row `suppressed` with the note "Needs new text consent: the number
  changed since the resident agreed".
- On the resident's Account → Text messages panel, the resident sees "Your number changed — agree
  again to get texts" and the agree box again.

## Legacy opt-ins (before BL-110): treated as needing consent

Some rows have `sms_opt_in = true` but no consent audit row. Nothing should have written those
rows, because BL-110 is the column's first writer. Any row like that, whether from a manual SQL
edit, an import or a board client before the 2026-10-20 trigger, is treated **conservatively, as
not consented**:

- Nobody on such a row is texted.
- The resident's panel shows "Agree again to keep getting texts" with the agree box.

We do not backfill a grant for these rows. We have no record of what disclosure, if any, they saw.
Under TCPA/CTIA, a consent we cannot evidence is the same as no consent.

To check how many rows this affects (counts only):

```sql
select count(*) from public.resident_communication_preferences p
where p.sms_opt_in = true and p.user_id is not null
  and not exists (select 1 from public.audit_log a
                  where a.org_id = p.organization_id and a.user_id = p.user_id
                    and a.action = 'sms_consent_granted');
```

## Where it is enforced

The same rule (`lib/communications/preferences.ts` `applyPreferences(…, phone)`, with the ledger
in `lib/sms-consent-ledger.ts`) runs on every SMS path:

| Path | Reads |
|---|---|
| Broadcast send-now: `communications/send.ts`, a one-argument change that passes `r.phone` | One paged read of the org's consent rows per send, only when someone in the org has texts on. No per-recipient read (no N+1). |
| Scheduled dispatch: `communications/scheduled-dispatch.ts` | Same read, at dispatch time, so a number changed after scheduling is caught |
| Composer preview counts: `communications/preference-actions.ts` | Same read, so "N will be skipped" matches the send |
| Recurring-event alerts: `lib/events-alerts.ts` | Same read. **This path previously texted any phone on file, ignoring `sms_opt_in`.** It now follows the broadcast rule. A failed read texts nobody. |
| ARC / ticket resident notices: `resident-notify/run.ts` + `store.ts` | One read of that resident's own consent rows |

When a consent read fails, the send is refused. The error is "Couldn't check residents' message
preferences. Nothing was sent." We never fall back to texting anyone.

Who reads the consent rows:

- Board clients read audit_log under RLS (0063 `audit_log_select`, board/admin).
- The resident's panel reads only that resident's own rows, through the service role, filtered on
  org and user.

## Consequences

- A resident who adds a second number has to agree again before the new number gets texts. Their
  old number keeps working until they do.
- START (BL-111 inbound) restores consent only for the number that sent it. If STOP had cleared
  two numbers, the other number needs the portal agreement again.
- Hashes are never logged. A US phone hash can be brute-forced, so we treat it as the number
  itself.
