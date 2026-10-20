# 2026-10-20 page-load static pass (BL-099 follow-up, backlog item 4)

**Date:** 2026-10-20 · **Status:** fixes shipped on the branch; index ideas are proposals only (`docs/specs/2026-10-20-perf-indexes-2.sql`, not applied).

**Method:** code analysis only. No production `[perf]` logs were read, no local database, no seeds, no screenshots. Three read-only audit agents traced each page's server data loading, and every finding below was re-checked in the code before anything was changed. Each finding names the waterfall (awaits in series that do not depend on each other), an N+1 (a query awaited inside a loop), an unbounded or wide read, a repeated query, or work blocking the shell outside `<Suspense>`.

**Rules kept:** no change to what any page shows or to any query's filters. Every fix either starts an existing query earlier, sends existing chunked queries together, or drops a read whose answer the request already had. Every page touched logs through `timed()` (`apps/hoa/src/lib/perf/timing.ts`), so the prod `[perf]` lines will show the effect.

**Proof:** each fix has a unit test that holds one query open and checks that the others were already sent. This is the pattern from `lib/search/records.test.ts`, made into a shared wrapper, `apps/hoa/src/lib/supabase/held-fake-db.ts`.
- The wrapper records every query that is actually sent (a PostgREST builder sends nothing until `then()`, `single()` or `maybeSingle()` is called).
- It holds the chosen tables until `release()`.
- All 18 new parallelism tests were run against the pre-fix source, and all 18 fail there.

---

## Fixed

| # | Page(s) | Problem | Fix | Round trips saved on the critical path |
|---|---|---|---|---|
| 1 | Dashboard home (3 cards: Dues KPI, Open work KPIs, Daily digest) | `getDashboardKpis` (`lib/dashboard/charts.ts`) awaited the time-zone read, the unpaid-assessments read and 4 head counts one after another. | All 6 reads start at once; the zone is applied after they return. | about 5 |
| 2 | Dashboard home (Leased KPI, lease card, digest) | `getLeaseSummary` (`lib/dashboard/queries.ts`) counted leased homes in a `for … await` over 150-id chunks; the waiting-list count waited behind all of it. | The chunks are sent together. The waiting-list count starts alongside the units read. | 1 per extra 150 units, plus 1 |
| 3 | Every accounting page (`/accounting`, ledger, reports, …) | `getAccountingContext` re-read the `associations` row the memoized primary-association read had just returned, only to get `organization_id` and the zone. This blocked the shell of every accounting page. | Use `assoc.timeZone` and the memoized `getCurrentOrg().id`; that second read is gone. | 1 |
| 4 | `/accounting` key figures, balance sheet, income statement, month-end report | `readLedgerLines` (`lib/accounting/queries.ts`) paged each 150-journal-entry chunk in series. That is at least 2 round trips per chunk, and the number of chunks grows forever. | Chunks are paged together; order is kept, and any failed page still fails the read. | 2 per extra 150 entries |
| 5 | `/accounting/ledger/[id]` | `getJournalEntry` read the header, then the lines. The lines read needs only the id. | Both reads together; the header still decides (no header in this association means `null`, and the lines are dropped). | 1 |
| 6 | `/accounting/ledger` | Context, then search params, then periods, then entries, in series. | Context and params together. With no explicit `?period=<id>` (the default view, or `all`), the entries read goes out with the period list. An explicit period still waits to be checked, so an unknown id falls back to the current period exactly as before. | 1 (default view) |
| 7 | `/dues` | `<WhoOwesPanel>` sat outside `<Suspense>`, so the whole page waited for a full read of open charges plus a serial `ownerships` chunk loop (`lib/dues-reminders/packets.ts`). | The panel streams in a `<Suspense>` with a skeleton. The ownerships chunks are sent together, which also speeds up the send-reminders action. | Charges table no longer waits for the panel; 2 per extra 150 owing units |
| 8 | `/inbox/[id]` (worst page: about 10 stages in series) | 1. The thread read, then a direct `supabase.auth.getUser()` (a second auth round trip; the layout already made one), then counts, then two `Promise.all` batches, then the rail, library, vendor read and vendor links, each awaited in turn.<br>2. The rail took `context.residents` as an argument, so it could not start before the property context. Those residents are only used to name the sender after the rail's own reads. | 1. The thread, the memoized `getSignedInUser()` and the counts run together.<br>2. Everything that needs only the thread or the org (auto-draft, assignees, SLA, undo draft, rail, document library, vendor row, vendor links) starts as soon as the thread is in, and is awaited where it was before.<br>3. `getThreadRailContext` now accepts the residents as a promise. | about 5–6 |
| 9 | `/inbox` | A direct `auth.getUser()`. The SLA, assignee, draft-quality and undo reads waited for the status and count reads, although none of them uses the counts. | `getSignedInUser()`; those 4 reads start before the counts. | 2 |
| 10 | `/inbox` (draft-quality card) | `loadDraftQuality` (`lib/inbox/draft/metrics-store.ts`) checked cancelled drafts in a serial loop over 150-id chunks. | Chunks sent together. | 1 per extra 150 drafts |
| 11 | Every resident page | `lib/impersonation.ts` kept its **own** `cache()` around `auth.getUser()`, separate from `lib/orgs`' `getSignedInUser`. The resident layout awaited `getSignedInUser()` and then `getResidentActor()`, so every resident page paid for two auth round trips, the second only after the first had finished. | `getResidentActor` reads the user through `getSignedInUser`. | 1 |
| 12 | `/resident/account` | A third `auth.getUser()`; then the profile name, the email consent and the text-message state, one after another. | `getSignedInUser()`; the three reads go out together. | 3 |

**Timing added:** `/inbox`, `/inbox/[id]`, `/accounting/ledger`, `/accounting/ledger/[id]` and `/resident/account` had no `timed()` at all. They now log per loader. `/dues` now also times the who-owes panel (`dues.whoOwes`, `dues.lastReminded`). The loader names, as they appear in `[perf]` lines:
- `/inbox`: `inbox.counts`, `inbox.list`, `inbox.draftQuality`.
- `/inbox/[id]`: `inbox.thread`, `inbox.counts`, `inbox.list`, `inbox.propertyContext`, `inbox.draft`, `inbox.rail`, `inbox.autoDraft`, `inbox.library`.
- `/accounting/ledger`: `ledger.context`, `ledger.periods`, `ledger.entries`.
- `/accounting/ledger/[id]`: `journalEntry.context`, `journalEntry.load`.
- `/resident/account`: `account.actor`, `account.units`, `account.contacts`, `account.profile`, `account.emailConsent`, `account.texts`.
- `/dues`: `dues.whoOwes`, `dues.lastReminded`.

**Tests added:**
- `apps/hoa/src/lib/dashboard/parallel-loaders.test.ts`
- `apps/hoa/src/lib/accounting/parallel-loaders.test.ts`
- `apps/hoa/src/app/(dashboard)/inbox/page-parallel.test.ts`
- `apps/hoa/src/app/(dashboard)/inbox/[id]/page-parallel.test.ts`
- `apps/hoa/src/app/(dashboard)/accounting/ledger/page-parallel.test.ts`
- `apps/hoa/src/app/resident/account/page-parallel.test.ts`
- One new case each in `lib/dues-reminders/packets.test.ts`, `lib/inbox/draft/metrics-store.test.ts` and `lib/impersonation.test.ts`.
- Two existing mocks gained the function the code now calls: `getCurrentOrg` in `open-next-fiscal-year.test.ts`, and `getSignedInUser` in `impersonation.test.ts`.

---

## Found, not fixed (ranked; each needs more than a minimal diff or a product call)

1. **The dashboard layout blocks every board page on the approvals badge.** `app/(dashboard)/layout.tsx:75` awaits `countPendingApprovals` (7 counts, one of which chains `associations` → vendor counts) before any of the shell renders, only to feed the sidebar badge.
   - **Fix:** pass the counts to `HoaSidebar` as a promise and read them with `use()` under `<Suspense>`.
   - **Why not here:** it touches a client component on every page, and nobody can see the UI to confirm it (Safari only, no ui:shots). **Best next fix.**
2. **The `/communications` list embeds every recipient row of every communication.** At `lib/communications/queries.ts:79-83`, the embed is `recipients:communication_recipients(delivery_status, rendered_subject, error_message)` with no limit, on 100 rows per page, only to count statuses in JS. The payload is about 100 × the number of homes.
   - **Fix:** a per-communication status-count view or RPC.
   - **Why not here:** it needs a migration.
3. **`/properties` reads the whole association on every request to show 50 rows.**
   - It reads all of `hoa_property_list_v` (an aggregating view), plus 6 paged reads in `lib/properties/list-signals.ts`: all-time `arc_requests`, and 365 days of events, violations, threads and payments.
   - **Fix:** a server-side page plus signals for that page only, or a materialized signal column.
   - **Why not here:** it is a design change. The index ideas below help in the meantime.
4. **The dashboard reads `associations` up to 7 times per request, with no memo.** The places are:
   - `orgTimeZone` in `charts.ts` (activity, KPIs) and `queries.ts` (next meeting)
   - the lease, heat-map and at-risk reads
   - the layout badge

   `lib/association-time-current.ts` `currentTimeZone` is memoized, but the fetchers take a `client` argument for the rolled-back `unstable_cache` layer. It is now off the critical path for the KPIs (fix 1), but still serial in `getNextMeetingResult` (zone → future → past) and `getThreadDetail`'s `getPropertyContext`.
5. **The donut and community counts read every row only to count.**
   - The fetchers: `getViolationStatusDonut` and `getTicketCategoryDonut` (`charts.ts`), `getCommunitySnapshot` (`queries.ts`).
   - The cost: each is at least 2 round trips because of `readAll`'s empty-page terminator, and grows with history. Head counts per status, or a grouped-count RPC, would be constant.
6. **The thread page re-reads the same rows.** Each is read 3 times per request (`getThreadDetail`, `autodraft.ts`, `thread-context.ts`, `vendor-request-links.ts`):
   - the thread row
   - its messages (`gmail_message_id`)
   - its latest draft

   `associations` is read 4 times. A per-request memo keyed by thread id would remove most of these.
7. **`listThreads` (`lib/inbox/queries.ts:611`) pulls every inbound message, including full `stripped_text`, for the 50 listed threads.** It keeps only the newest per thread and 140 characters of it. A `DISTINCT ON (thread_id)` view or RPC would bound it.
8. **The resident home makes avoidable dependent round trips.**
   - `getOpenViolations` re-reads `units.legacy_hoa_property_id`, which the resident-units join could carry.
   - `getDues` reads assessments, then payments; one embedded `payments(amount)` read would do.
9. **The property 360's second wave waits for all of wave 1.** In `lib/properties/property-360.ts:130`, wave 2 needs only `unitRes`. Chaining wave 2 off `unitRes` would save about 1 round trip. It is left for now because the 360's wave structure carries the per-section failure flags.
10. **`/resident/account` and the property 360 read the org's entire email-consent history.** `loadEmailConsent` reads it all to show one member's state on the account page. A `user_id` filter is right there. For a resident, RLS already narrows it; for an admin viewing as a resident, it is the whole org.

### A correctness bug found on the way (not perf, not changed)

`lib/property-scope.ts:43` selects `organization_id` from `hoa_properties`, whose column is `org_id` (`migrations/0000_schema.sql`). The read errors, the error is ignored, and `/dues?property=…` then filters on a dummy id, so the property-scoped dues view always shows no charges. **Worth its own small fix and test.**

---

## Per page

| Page | Uses `timed` | State after this pass |
|---|---|---|
| Dashboard home | yes (all loaders, `lib/dashboard/loaders.ts`) | Already streams per card. KPIs and lease are now parallel inside. Remaining: layout badge (#1), associations memo (#4), donut reads (#5). |
| `/inbox` | **now yes** | Serial getUser removed; enrichment reads start before the counts. Remaining: `listThreads` message over-fetch (#7). |
| `/inbox/[id]` | **now yes** | About 10 serial stages down to about 4. Remaining: repeated thread, message and draft reads (#6). |
| `/communications` | partly (association, list) | Unbounded recipient embed (#2). Reply-drafts read only needed on the Drafts tab. |
| `/properties` | yes | Whole-association reads (#3). |
| `/properties/[id]` | yes | Already parallel, plan standings streamed. Wave-2 wait (#9), consent history (#10). |
| `/accounting` | yes | Shell no longer pays the extra associations read; key figures' ledger lines paged in parallel. |
| `/accounting/ledger` | **now yes** | Default view sends entries with periods. |
| `/accounting/ledger/[id]` | **now yes** | Header and lines together. |
| `/dues` | yes (+ who-owes now) | Who-owes panel streams; owners read in parallel. |
| `/approvals` | yes | Already streams every section. Smaller things: per-bill `createSignedUrl` (batchable with `createSignedUrls`), and `ai_runs` input/output read with no limit (`lib/approvals-inbox/load.ts:59`). |
| Resident home | yes | One auth round trip fewer (fix 11). Remaining: #8. |
| `/resident/account` | **now yes** | 3 serial reads plus 2 extra auth calls collapsed. |

## Index suggestions

New candidates are in `docs/specs/2026-10-20-perf-indexes-2.sql` (3 indexes; none duplicates `docs/specs/2026-10-19-perf-indexes.sql` or an existing index in `migrations/`). The 12 in the 2026-10-19 file still apply and still wait for Asaf; #3, #9 and #11 there matter most for the pages above.
