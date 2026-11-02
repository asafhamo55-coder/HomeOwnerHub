# Amenity reservations: full design (BL-034)

Assumption: "tenant" in the owner's request means each association (the HOA, one `orgs` row), not a renter. Each HOA builds its own amenity list.

Status key used below: **Already built** (dark, commit e63399a7, behind `M11_APPLIED`, migration 0076 not yet applied) or **Gap** (not built). Paths are under `apps/hoa/src/` unless stated. Legal and governing-document points are flagged as questions for a lawyer or the HOA's own documents; this spec states no legal conclusions.

## 1. Goals and non-goals

**Already built (v1 scope):** board defines amenities with hours, max length, days ahead, per-home limit and an approval switch; residents book a day and whole-hour range; the database refuses overlaps; board approves, denies, cancels; residents cancel.

Goals:
1. A board can list every shared space (clubhouse, pool pavilion, tennis court, grill area, guest suite) and its rules in under 10 minutes.
2. A resident can see what is free and book it in about four taps, on a phone, without calling anyone.
3. Two bookings never collide, and nobody is double-charged for a mistake (fees come later).
4. The board is told when something needs an answer, and residents are told the answer.

Non-goals (v1 through phase 3): fees, deposits, refunds (phase 4, section 15); recurring bookings (weekly yoga); waitlists; guest or non-resident booking; calendar sync (iCal feed is phase 3 at most); key or gate integration; a marketplace of outside vendors.

## 2. Persona

A 70-year-old volunteer board member or resident on a phone, not tech-savvy (memory: older-users UX). Design rules:
- Text at least 16px, buttons at least 44px tall, one question per screen section, no jargon ("Book this time", not "Create reservation").
- Never show a choice that will fail. Show only valid times; explain unavailable ones in words ("Taken", "Closed", "Too far ahead").
- Every error says what to do next. Every success says what happens next and who will answer.
- Sign-in link from an email or text lands directly on the booking page (link, register, use must be effortless).
- No hover-only controls, no drag and drop, no tiny calendar cells.

## 3. Board's amenity list

**Already built:** create, edit, close for booking (`is_active`), name, description, free-text house rules, approval switch, open and close hour, max hours, days ahead, bookings per home. Files: `(dashboard)/amenities/page.tsx`, `AmenityDialog.tsx`, `lib/amenities/actions.ts` (`saveAmenity`), `model.ts`, migration 0076 `amenities`. Server action gates on board or admin and scopes by org.

**Gap:** the rest of the wish list. Target field set per amenity:

| Field | Meaning | Status |
|---|---|---|
| name, description | what it is | Already built |
| photos (up to 4) | helps a resident recognise it | Gap |
| capacity | max people for the space (display and party-size check) | Gap |
| concurrent bookings | 1 (exclusive, today) or N (for example 4 tennis courts as one amenity, or lap lanes) | Gap |
| weekly hours | different hours per weekday, closed days | Gap (today one open/close pair) |
| slot length | 30, 60 minutes or whole-day buckets | Gap (today whole hours) |
| buckets | named blocks such as "Morning 8 to 12", "Evening 5 to 10", "All day" | Gap |
| blackout dates | pool closed for winter, clubhouse closed for election night | Gap |
| max length | hours per booking | Already built |
| days ahead, and minimum notice | for example not within 24 hours | days ahead built; minimum notice Gap |
| per-home limit | active bookings per home per amenity | Already built; per week or month limit Gap |
| approval | auto-confirm or board approves | Already built; "auto if under X hours" Gap |
| rule documents | PDF rules, waiver, insurance form | Gap (text rules only today) |
| acknowledgement | resident ticks "I read the rules" before booking | Gap |
| retire | hide from residents, keep history | partial: `is_active` exists, no retire flow |

Board UI, plain words (text wireframe, phone width):

```
Amenities                         [ Add an amenity ]

Clubhouse            Board approves
Open 8:00 AM to 10:00 PM. Up to 4 hours. 60 days ahead.
[ Edit ]  [ Close for booking ]

Add an amenity
 Name .............. Clubhouse
 What is it? ....... Large room with kitchen
 Photos ............ [ Add a photo ]
 Hours ............. Same every day / Different by day
 Longest booking ... 4 hours
 Who approves? ..... (o) Board approves  ( ) Booked right away
 Closed dates ...... [ Add a date or range ]
 Rules (PDF) ....... [ Add a file ]
 [ Save ]
```

## 4. Resident flow

**Already built:** `resident/amenities/page.tsx` lists each amenity with description, rules summary, approval line, house rules, an "Already taken" list (first 12), and `BookingForm.tsx` (home picker if more than one, date input, From and Until hour selects, optional purpose, submit). "Your bookings" shows status, board note, cancel button. Success toasts: "You are booked." or "Request sent. The board will answer here."

**Gap:** the flow shows a taken list and lets the resident guess; it should show free time. Target flow:

1. **Choose an amenity**: large cards, photo, one line of rules, "Booked right away" or "Board approves".
2. **Pick a day**: a 14-day strip (today first), then "More dates". Days with nothing free are greyed with the word "Full" or "Closed".
3. **Pick a time**: a list of big buttons, each a start time or bucket, labelled Free or Taken. Tap a start, then tap an end (only valid ends offered).
4. **Check and confirm**: summary sentence, rules link, acknowledgement tick, optional purpose, one button.
5. **Confirmation**: what happened, what next, add to calendar.

Wireframes:

```
Step 3 of 4: Saturday, Nov 8
Clubhouse is open 8:00 AM to 10:00 PM.

 8:00 AM   Free       [ Choose ]
 9:00 AM   Free       [ Choose ]
10:00 AM   Taken
11:00 AM   Taken
 12:00 PM  Free       [ Choose ]
 ...
You can book up to 4 hours in a row.
```

```
Step 4 of 4: Check your booking
Clubhouse
Saturday, Nov 8, 2:00 PM to 6:00 PM
For 12 Oak Lane
[x] I read the house rules (View rules)
What is it for? (optional) ____________
[ Ask the board for this time ]        <- or "Book this time"
```

```
Done.
Your request is with the board. You will get an email when they answer.
Your time is held for you until then.
[ See my bookings ]  [ Back to spaces ]
```

Availability is shown per day from `loadHeldSlots` plus rules (weekly hours, blackouts, advance window, per-home limit). The server recomputes everything on submit; the screen is advisory (already how `checkRequest` works).

## 5. Availability logic

**Already built:** `lib/amenities/model.ts` `checkRequest` (pure, tested in `model.test.ts`); `overlaps` uses half-open ranges so back-to-back bookings are allowed; times stored as `timestamptz`; conversion with `instantAtLocalTime(day, hour, timeZone)` from `lib/association-time` and `todayIn` for "today" and the advance window; association time zone comes from the resident's unit (`association_time_zone`) with a default; board view uses `currentTimeZone()`. Database trigger `amenity_reservation_no_overlap` takes an advisory lock per amenity and rejects overlaps with SQLSTATE 23P01; app maps it to "Someone else just booked that time."

Rules, in order (current behaviour, extended with Gap items marked):
1. Amenity active and not retired.
2. Day is a valid association-local date. **Gap:** not a blackout date, and the weekday is open.
3. Start inside open hours; end after start, not past closing, within max length.
4. Start is in the future (association-local now), and not after today plus days ahead. **Gap:** minimum notice.
5. Home is under its active-booking limit.
6. **Gap:** party size within capacity.
7. No overlap with a held (pending or approved) booking; **Gap:** with capacity N, overlap count must stay below N.

Time zone and DST:
- All rules are evaluated in the association's IANA zone, never the browser's or the server's. Store UTC instants; derive local day and hour only for display and rule checks.
- "Close hour 24" means local midnight of the next day. A booking from 6 PM to midnight is stored as two instants and may be up to 24 hours (existing CHECK).
- Spring-forward: a local time that does not exist (2:30 AM) must never be offered; hours listed for that day skip it. Fall-back: a local hour that occurs twice must resolve to one chosen instant (first occurrence) and display unambiguously. **Gap:** confirm `instantAtLocalTime` behaviour and add tests for both transition days in `model.test.ts` (build item 14). The max length is wall-clock hours as the resident sees them; on a transition day the real elapsed time can differ by an hour, which is acceptable and should be stated to the board in the form help text.
- A board moving the association's time zone does not move existing bookings (they are instants); it changes only how they display. Flag in the zone-change screen.

Capacity versus exclusive: v1 treats every amenity as exclusive (one booking at a time). Capacity (concurrent N) needs the trigger changed to count overlapping holds against `concurrent_limit` under the same advisory lock. Party size is a soft, resident-stated number used for display and a capacity check, not a head count enforcement.

## 6. Statuses and cancellation

**Already built:** statuses `pending`, `approved`, `denied`, `canceled`. Transitions: pending to approved, denied or canceled; approved to canceled. Labels: "Waiting for the board", "Confirmed", "Not approved", "Canceled" (`STATUS_LABELS`). A held booking counts against the home's limit until it ends. Resident or board may cancel before start (`canCancel`, `cancelReservation`); the board must give a reason when denying (`decideReservation`); decisions are race-safe through `.eq('status','pending')` and a start-in-future guard. Cancel columns `canceled_by`, `canceled_at` exist.

**Gap:**
- Cancel reason (optional for resident, required for board) shown to the other side.
- Cancellation cutoff per amenity (for example "cancel at least 24 hours ahead without a note to the board"); after the cutoff the resident sees "Ask the board to cancel". Do not tie to money until phase 4.
- Display-derived states "Completed" (ended, was approved) and "No longer held" (pending request whose start passed). Compute at read time; do not add enum values.
- Auto-expire: a pending request that nobody answered by its start becomes unavailable and the resident is told. No cron needed; derive at read time, optional job to notify (build item 9).
- Edit or reschedule: v1 is cancel and rebook. Reschedule (keep the status, move the time with the same checks) is phase 3.

## 7. Board calendar view

**Already built:** list view only: "Waiting for your answer", "Coming up" (approved), "Your amenities" (`(dashboard)/amenities/page.tsx`, `ReservationButtons.tsx`, `loadBoardReservations`). Times shown in the association zone.

**Gap:** a calendar for the board.
- Month grid for one amenity at a time (filter chips), phone fallback to a day-by-day list.
- Colours plus words: Confirmed, Waiting, Blackout.
- Tap a day to see its bookings; board actions inline (approve, deny, cancel).
- Board can add a **board hold** (maintenance, board meeting): a reservation by the board with no home. Needs `unit_id` nullable plus a `kind` of `booking | hold` (see data model).
- Print view and "This week" summary for the board packet. Amenity filters and a search by home.

```
November              Clubhouse v
Su Mo Tu We Th Fr Sa
                  1
 2  3  4  5  6  7  8*   * 2 bookings, 1 waiting
Tap a day to see who booked.
```

## 8. Notifications

**Already built:** nothing sends. `actions.ts` states "Nothing is emailed or texted from here." In-app status is visible on both pages only.

**Gap:** notification set, all opt-in aware and routed through the repo's outbound guard (`lib/owner-invites.ts`, `lib/sms.ts` already use it; email consent in `lib/email-consent.ts`, SMS consent in `lib/sms-consent.ts`, in-app board notices in `lib/board-in-app-notify.ts`, resident send patterns in `lib/resident-notify/`).

| Event | To | Channel | Opt-in |
|---|---|---|---|
| Request received | board | in-app plus email digest | board setting, default on |
| Approved or denied | resident | email, SMS if consented | email follows existing consent |
| Canceled by the other side | the other side | email | same |
| Reminder 24 hours before | resident | email, SMS if consented | resident can turn off |
| Unanswered 48 hours | board | in-app | default on |

Rules: SMS is 279 characters or fewer (memory); check consent first, never send to an address without consent; log ids and counts only, never addresses or message bodies. Copy has no em dashes. Example email: "Your request for the Clubhouse on Saturday, Nov 8, 2:00 PM to 6:00 PM was approved. You can cancel any time before it starts." Example denial: "The board could not approve this time. Their note: the room is closed for repairs. You can pick another time."

Jobs budget: Inngest Hobby limit is 50k executions per month (memory). Reminders must be one daily sweep, not a cron per booking. Prefer sending approvals inline from the action.

## 9. Data model

**Already built (migration 0076):**
- `amenities`: id, organization_id, association_id, name, description, rules, requires_approval, open_hour, close_hour, max_hours, advance_days, max_active_per_unit, is_active, created_by, timestamps. Checks on ranges.
- `amenity_reservations`: id, organization_id, association_id, amenity_id, unit_id, requested_by, starts_at, ends_at, status, purpose, decision_note, decided_by, decided_at, canceled_by, canceled_at, timestamps. Checks: end after start, at most 24 hours, canceled iff `canceled_at` set.
- Indexes by amenity and time (held only), unit, association and status. Triggers: `updated_at`; no-overlap (advisory lock); same-org foreign key triggers.

**Gap (one new migration, number assigned when written, additive and idempotent):**
- `amenities`: add `photo_paths text[]`, `capacity smallint`, `concurrent_limit smallint default 1`, `slot_minutes smallint default 60`, `min_notice_hours smallint default 0`, `cancel_cutoff_hours smallint default 0`, `limit_per_unit_period` (count and `week|month`), `retired_at timestamptz`, `require_ack boolean`, `sort_order smallint`.
- `amenity_hours`: amenity_id, weekday 0-6, open_minute, close_minute (or none for closed). Replaces open/close hour when present; old columns remain as default.
- `amenity_blackouts`: amenity_id, starts_on, ends_on (association-local dates), reason.
- `amenity_buckets`: amenity_id, name, start_minute, end_minute, weekdays (optional).
- `amenity_documents`: amenity_id, storage path, title, kind (`rules|waiver|insurance`); stored like other private documents (signed URL via a route, see `app/resident/documents/[source]/[id]/route.ts` for the pattern).
- `amenity_reservations`: add `party_size smallint`, `kind text default 'booking'` (`booking|hold`), `unit_id` nullable only when `kind='hold'`, `rules_snapshot jsonb` (rules text and ack time at booking), `cancel_reason text`, `ack_at timestamptz`.
- Replace the no-overlap trigger body with a count against `concurrent_limit` under the same advisory lock; keep the 23P01 code so the app mapping is unchanged.
- Every new table: `organization_id`, same-org foreign key triggers, RLS as in section 10, and an entry in the same-org ratchet test.
- Regeneration caution (CLAUDE.md footgun 3): apply the migration to prod before `pnpm gen:types`; until then `LooseDb` in `lib/amenities/queries.ts` stays.
- Process (memory): the owner applies migrations; the SQL is copied to the clipboard for Asaf, then dependent code ships after confirmation.

## 10. Security, tenant isolation, RLS

**Already built:**
- RLS on both tables. Members of the org read amenities; board and admin read all reservations of the org; a resident reads rows for their own homes (`auth_resident_unit_ids()`). No INSERT, UPDATE or DELETE policy for web roles; privileges revoked; all writes by server action with the service role after an explicit check (`requireBoardOrAdminForAction`, `getResidentUnits`, impersonation is read-only).
- Every service-role query filters by `organization_id` from the caller's session, and a booking's home must be in the same association as the amenity (`requestReservation`).
- The resident page shows taken times without names (`loadHeldSlots` returns times only).
- Same-org foreign key triggers prevent cross-org pointers.

**Gap:**
- New tables follow the same shape: read-only RLS, server-only writes.
- Photos and documents: private bucket, read through a route that checks the caller's org and association, short signed URLs.
- `saveAmenity` picks "the org's first association" when creating (`actions.ts`). Orgs with several associations need an association chooser (build item 13), and the resident list already filters by the resident's associations.
- Rate-limit `requestReservation` per user (a script could hold many slots; the per-home limit helps but a user with several homes should be capped overall).
- A resident cannot see another home's purpose or note (RLS covers it; add an integration test).
- Integration tests in `tests/integration/` on CI's ephemeral DB (never prod, no local DB): cross-org read denied, resident cannot write, overlap race returns 23P01, capacity N.

## 11. Edge cases

**Already built:** a denied or canceled booking frees its slot (the trigger counts pending and approved only); an inactive amenity rejects new requests but existing bookings remain; board cancel works at any time before start; double-click race is handled by the database.

**Gap, with the proposed behaviour:**
- **Home sold or owner changed.** Bookings belong to the home, not the person. On an ownership or occupancy change, future bookings stay, the new household sees them, and the board gets a notice on the list. Option: auto-cancel future bookings made by a removed user (decision D6). A lawyer or the governing documents may decide whether a new owner inherits a prior owner's reservation.
- **Delinquent owner.** Optional board rule per amenity: "Homes with an overdue balance cannot book". When on, the booking page says "Your account has a balance. Please contact the board." with no amounts shown. Whether an HOA may restrict amenity use for unpaid assessments depends on Georgia law and the association's own documents; a lawyer should confirm before this ships, and it ships off by default (D3). Needs a read from the accounting ledger (build item 11).
- **Fair-housing and use restrictions.** Rules about who may use a space, guest limits, age-restricted pool hours or children's hours can touch fair-housing law (including familial status) and the declaration's use restrictions. Provide neutral, board-written rule text and no preset rules about people. Have a lawyer review any template language before it is offered. Do not infer or display household composition.
- **Amenity retired with bookings.** Retiring asks the board what to do with future bookings: keep them, or cancel all with one message. Default: block new requests, keep existing, show a banner. Pending requests on a retired amenity are denied with the board's note on "cancel all".
- **Board changes rules with existing bookings.** Existing bookings keep the rules they were made under (`rules_snapshot`). A change that would invalidate them (shorter hours, new blackout) shows "This affects 3 bookings" with the list, and offers: keep them, or cancel them with a note. Never cancel silently.
- **Blackout added over an approved booking.** Same screen as above.
- **Two homes, one person.** Per-home limits apply per home; the overall per-user cap in section 10 applies across homes.
- **Board member books for themselves.** Treated like any resident; auto-approval by the same person is not allowed, so a second board member approves (D5).
- **Impersonation (support view).** Read-only already.
- **Association time zone missing.** Falls back to the default zone; the board settings should warn once.
- **Past bookings and history.** Kept; shown 30 days on the resident page, longer on the board view.

## 12. Analytics

**Already built:** none.

**Gap (counts only, no personal data in event payloads, ids only):**
- Events: amenity_created, booking_requested, booking_approved, booking_denied, booking_canceled (who), booking_conflict (23P01 hit), form_abandoned at each step.
- Board report: bookings per amenity per month, utilisation (booked hours over open hours), peak days and hours, approval time (median), deny and cancel rates, unused amenities (candidates to retire).
- Product health: percent of orgs with at least one amenity, time from sign-in link to first booking, conflict rate (high means the picker shows stale free times).
- Logs follow the existing rule: ids and error codes only.

## 13. Phased delivery

- **Phase 0 (blocked on the owner):** apply migration 0076, flip `M11_APPLIED` (`packages/db/src/m11.ts`), add navigation. Nothing else depends on new SQL.
- **Phase 1, usable v1 (no new SQL):** nav links in both apps, free-time picker, board hold-free calendar list improvements, notifications (request, decision), analytics events, DST tests, association chooser.
- **Phase 2, the owner's full request (one migration):** blackouts, weekly hours, buckets, capacity and concurrent N, photos, rule documents and acknowledgement, retire flow, cancel cutoff and reason, rules snapshot, board calendar and board holds.
- **Phase 3:** reschedule, reminders sweep, iCal feed, delinquency and eligibility rules (after legal review), reports.
- **Phase 4:** fees and deposits (section 15).

## 14. Open owner decisions (each with a recommendation)

| # | Decision | Recommendation |
|---|---|---|
| D1 | Default approval: board approves or booked right away | Right away for low-risk spaces (courts, grill); board approves for the clubhouse. Let the board choose per amenity, default "Board approves" as today. |
| D2 | One amenity with N units (courts) or N amenities | One amenity with concurrent limit N. Simpler list, one calendar. |
| D3 | Block delinquent homes from booking | Build the switch, off by default, and do not ship it until a lawyer or the governing documents confirm it. |
| D4 | Time granularity | 30-minute slots for new amenities, buckets for party spaces. Keep whole hours as the default. |
| D5 | Can the booker approve their own request | No. Require a different board member; if only one board member exists, auto-approve is allowed. |
| D6 | Auto-cancel when an owner leaves | No. Keep bookings, notify the board. |
| D7 | Who sees who booked | Residents see times only (as built). Board sees homes. |
| D8 | Cancellation cutoff default | 24 hours, off until the board sets it. |
| D9 | Notify by SMS | Email first; SMS only for consenting residents, reminders and decisions, within 279 characters. |
| D10 | Fees and deposits in v2 | No. Wait for online payments (BL-035). |
| D11 | Guest booking for non-owner residents (renters) | Allow renters who are verified residents of the home, same limits. Check the HOA's own rules; a lawyer may weigh in. |

## 15. Fees and deposits (later phase)

Depends on online payments (BL-035) and the accounting ledger. Not in v1 and 0076 deliberately has no amount column.

How it plugs in:
- `amenities` gains `fee_cents`, `deposit_cents`, `fee_model` (`flat|per_hour`), and an income account mapping (so revenue lands in the right ledger account).
- A booking creates a charge on the home's ledger (fee) and a refundable deposit liability. A new status `awaiting_payment` sits before `approved` for paid amenities; the slot stays held for a short window (for example 30 minutes for card, until approval for the board-approved case) and then releases.
- Cancellation cutoff (section 6) becomes the refund rule. Deposit release is a board action after the event ("no damage").
- All money paths use the payment provider's test mode in integration tests, the existing ledger posting helpers, and audit entries for every refund.
- Whether the HOA may charge for use, fee levels and deposit handling can be governed by the declaration, rules, or Georgia law; the board and a lawyer decide. The product only records what the board sets.

## 16. Build list (gaps, numbered, with effort)

Effort: S under 1 day, M 1 to 3 days, L 3 to 6 days. Order is delivery order.

| # | Gap | Phase | Effort | Notes / files |
|---|---|---|---|---|
| 1 | Apply 0076, flip `M11_APPLIED`; add nav entries in the board and resident menus (no menu reference found by search) | 0 | S | owner step; `packages/db/src/m11.ts` |
| 2 | Free-time picker: 14-day strip plus slot buttons showing Free and Taken, replacing the date input and "Already taken" list | 1 | M | `resident/amenities/BookingForm.tsx`, `page.tsx`, new pure `daySlots()` in `model.ts` |
| 3 | Notifications: request, decision, cancel through the outbound guard and consent; board in-app notice | 1 | M | `actions.ts`, `lib/resident-notify/`, `lib/board-in-app-notify.ts` |
| 4 | Association chooser for multi-association orgs | 1 | S | `saveAmenity` (first association today) |
| 5 | DST and time zone tests (spring forward, fall back, close hour 24) | 1 | S | `model.test.ts`, `lib/association-time` |
| 6 | Analytics events and board report | 1 | S | section 12 |
| 7 | Migration 2: weekly hours, blackouts, buckets, slot length, min notice, capacity and concurrent limit, party size, rules snapshot, cancel reason, retired_at, holds; trigger update | 2 | L | section 9; owner applies |
| 8 | Board form: weekly hours, blackout dates, buckets, limits | 2 | M | `AmenityDialog.tsx`, `actions.ts` schema |
| 9 | Capacity and concurrent bookings in `checkRequest`, picker and trigger | 2 | M | `model.ts`, migration 2 |
| 10 | Photos and rule documents (private storage, signed URLs), acknowledgement step | 2 | M | new route like `resident/documents/[source]/[id]/route.ts` |
| 11 | Retire flow and "rules change affects N bookings" screen | 2 | M | `actions.ts`, dashboard page |
| 12 | Board calendar (month, per amenity) and board holds | 2 | M | `(dashboard)/amenities/` |
| 13 | Cancel cutoff and reason; derived Completed and No-longer-held states | 2 | S | `model.ts` `canCancel`, `STATUS_LABELS` |
| 14 | Reminder sweep (one daily job) and unanswered-request nudge | 3 | S | budget: Inngest Hobby 50k per month |
| 15 | Reschedule | 3 | M | reuse `checkRequest` |
| 16 | Delinquent and eligibility rule (off by default; legal review first) | 3 | M | needs ledger read |
| 17 | iCal feed per home | 3 | S | optional |
| 18 | Fees and deposits (after BL-035) | 4 | L | section 15 |
| 19 | Integration tests: cross-org read, resident write denied, overlap race, capacity N | 1 to 2 | M | `tests/integration/`, CI only |

## 17. Section status summary

| Section | State |
|---|---|
| 3 Amenity list | Already built (core); Gap (photos, buckets, blackouts, docs, retire) |
| 4 Resident flow | Already built (form); Gap (free-time picker, confirmation, acknowledgement) |
| 5 Availability | Already built (rules, overlap, zones); Gap (capacity, blackouts, DST tests) |
| 6 Statuses | Already built; Gap (cutoff, reasons, derived states, reschedule) |
| 7 Board calendar | Gap (list only today) |
| 8 Notifications | Gap |
| 9 Data model | Already built (0076); Gap (migration 2) |
| 10 Security | Already built (RLS, server writes); Gap (new tables, files, rate limit) |
| 11 Edge cases | Partly built; rest is Gap |
| 12 Analytics | Gap |
| 15 Fees | Gap, later phase |
