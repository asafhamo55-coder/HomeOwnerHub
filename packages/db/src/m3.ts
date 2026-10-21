/**
 * Migration batch M3 (migrations/0067_m3_batch.sql) switch.
 *
 * false until the owner confirms 0067 is applied in production (runbook
 * Section J, J3). Every code path that reads or writes an M3 column or
 * table checks this first, and with it false the app behaves exactly as
 * before M3 — and keeps working when the columns already exist (CI replays
 * 0067, so the integration suite runs "columns present, flag false").
 *
 * Flipping it to true is the one-line follow-up after the apply. Covers:
 *   BL-136 assessments.source = 'opening_balance'
 *          apps/hoa/src/lib/accounting/opening-balances/executor.ts (sets it)
 *          packages/jobs/src/hoa-late-fees.ts                      (skips it)
 *   BL-134 inbox_threads.snoozed_until / first_inbound_at / first_response_at
 *          apps/hoa/src/lib/inbox/snooze.ts, snooze-rules.ts, queries.ts,
 *          thread-clock.ts, app/(dashboard)/inbox
 *   BL-134 inbox_thread_links validation trigger (DB side is live on apply;
 *          the app maps its refusal: apps/hoa/src/lib/inbox/links.ts)
 *   BL-134 hoa_documents.source_inbox_attachment_id
 *          apps/hoa/src/lib/inbox/attachment-file.ts (writes it),
 *          apps/hoa/src/lib/inbox/provenance.ts       (reads it)
 *   BL-131 compliance_deadlines_done (replaces the HMAC-signed acks)
 *          apps/hoa/src/lib/compliance/deadlines.ts, actions.ts,
 *          app/(dashboard)/page.tsx, packages/jobs/src/daily-digest.ts
 *
 * No imports: pure modules, client components and the integration suite
 * import this.
 */
export const M3_APPLIED: boolean = true
