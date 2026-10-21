/**
 * Owner records requests (BL-123 item 3, migrations/0066_records_requests.sql)
 * switch.
 *
 * false until the owner confirms 0066 is applied in production. Before
 * that, tickets.category refuses 'records_request' (23514) and
 * tickets.records_due_at does not exist, so every code path that reads or
 * writes either checks this first. With it false the app behaves exactly
 * as before: no resident form, no board view, no digest lines, no writes.
 *
 * Flipping it to true is the one-line follow-up after the apply. Covers:
 *   apps/hoa/src/lib/records-requests/actions.ts   (file / mark fulfilled)
 *   apps/hoa/src/lib/records-requests/queries.ts   (board list)
 *   apps/hoa/src/app/resident/records/new          (resident form)
 *   apps/hoa/src/app/(dashboard)/tickets/records   (board view)
 *   apps/hoa/src/app/resident/requests, (dashboard)/tickets (entry links)
 *   packages/jobs/src/daily-digest.ts              (records lines)
 *
 * No imports: pure modules and the integration suite import this.
 */
export const RECORDS_REQUESTS_LIVE: boolean = true
