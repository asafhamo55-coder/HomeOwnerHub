# Ticket notifications — design

**Status:** approved 2026-08-31. Migrations 0053 (tables) and the VAPID env
vars must be applied before the feature does anything; all code ships ahead
of them and degrades to a no-op.

## Problem

`createResidentTicket` inserts the row, revalidates two paths, and returns.
Nobody is notified on any channel. A resident reports a leak and it waits
until a board member happens to open `/tickets`.

Asked for: notification **in the app**, and reaching the board member
**like an instant message** — i.e. on their phone with the app closed, with
the device's own notification sound.

## Shape

```
resident submits ticket
  └─ createResidentTicket inserts the row
     └─ emits Inngest event  ticket/created
        └─ ticketNotificationsJob
           ├─ resolve board members of that association
           ├─ insert notifications rows        ← the durable record
           └─ web-push to their push_subscriptions   ← best-effort
              └─ sw.js 'push'          → OS notification
                 'notificationclick'   → opens /tickets/<id>
```

## Decisions

**Inngest, not an inline send.** The resident must not wait on the board's
notifications, and a push provider hiccup must not fail or slow ticket
creation. Inngest is already the house pattern (~17 jobs) and brings
retries. The alternative — sending inline from the server action — was
rejected for exactly those two reasons.

**`notifications` is the record; push is an optimisation.** A board member
who never grants permission still sees the in-app list. Delivery failure
never loses the notification.

**Dedupe on `(user_id, kind, entity_id)`.** Inngest retries; a partial
unique index makes a replay idempotent rather than duplicating.

**Subscriptions keyed on `endpoint`.** That URL *is* the device identity to
the push service, so re-subscribing the same browser upserts instead of
accumulating a row per login. A 404/410 from the push service means the
endpoint is dead and the row is deleted on the spot, or they accumulate
forever.

**No `reasoning`-style secrets in the payload.** The push body carries the
ticket subject and unit, nothing a non-recipient shouldn't see; the full
detail is behind the link.

## Hard constraint — iOS

Apple delivers Web Push only to a PWA **installed to the Home Screen**
(iOS 16.4+). A board member using Safari normally gets nothing. The opt-in
UI must say so explicitly or the feature reads as broken. The app already
ships `manifest.ts`, `sw.js` and a service-worker registrar, so install
already works.

## Degradation, because this ships first

Every new read/write tolerates its table or env var being absent:

- no `VAPID_PRIVATE_KEY` → the job writes notifications and skips push
- no `notifications` table → the job logs and returns; ticket creation is
  unaffected because the event is fire-and-forget
- no `push_subscriptions` table → subscribe UI reports "not available yet"

## Testing

Pure and unit-tested: payload building, recipient resolution, the
dead-subscription predicate (which status codes prune). Not testable here:
anything in a browser or on a device — no browser automation, and the
author is Safari-only. The notification actually landing on a locked phone
must be confirmed by a human.
