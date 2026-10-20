/**
 * Violation statuses Fined and Dismissed (migrations/0066_records_requests.sql,
 * part 5) switch.
 *
 * false until the owner confirms 0066 is applied in production. Before
 * that, hoa_violations_status_check (0000_schema.sql) refuses 'fined' and
 * 'dismissed' (23514), so the status editor hides both and
 * updateViolationStatus refuses them with a friendly message instead of
 * a database error. With it false the other statuses work as before.
 *
 * Flipping it to true is the one-line follow-up after the apply (runbook
 * Section I, I3). Covers:
 *   apps/hoa/src/lib/violation-statuses.ts   (selectable / live helpers)
 *   apps/hoa/src/lib/violations.ts           (updateViolationStatus gate)
 *   apps/hoa/src/app/(dashboard)/violations/[id]/ViolationStatusEditor.tsx
 *
 * No imports: client components and the integration suite import this.
 */
export const VIOLATION_FINED_STATUS_LIVE: boolean = false
