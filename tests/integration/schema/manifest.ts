/**
 * The ordered list of migrations that constitute the schema.
 *
 * This file exists because `migrations/` is NOT a replayable sequence:
 * it mixes 66 real migrations with 5 `verify-*` assertion scripts and 23
 * unnumbered one-offs (`delete-madison-park-closed-threads-force.sql`,
 * `diagnose-inbox-duplicates.sql`, `fix-madison-park-lease-cap.sql`,
 * seeds). Replaying the directory would run a force-delete.
 *
 * Eight numeric prefixes also collide, so sorting filenames is not a
 * total order. Five are true same-number pairs — 0019, 0021, 0038, 0039,
 * 0040 — and each pair touches unrelated tables, so alphabetical order
 * within a number is safe. That is a decision, not a default; if a future
 * pair is order-dependent, fix it HERE, not by renaming files.
 *
 * Adding a migration? Append it. The replay is what CI trusts.
 */
export const MIGRATION_MANIFEST: string[] = [
  '0000_schema.sql',
  '0001_auth_fixes.sql',
  '0002_wizard_drafts.sql',
  '0003_storage_policies.sql',
  '0004_v1_schema_phase2a.sql',
  '0005_units_backfill.sql',
  '0005a_search_rpc.sql',
  '0005b_embedding_dim_swap.sql',
  '0006_accounting.sql',
  '0007_vendors.sql',
  '0008_association_compliance_settings.sql',
  '0009_vendor_onboarding_invitations.sql',
  '0010_state_statutes.sql',
  '0010b_search_state_statute_chunks_v2.sql',
  '0011_state_law_updates.sql',
  '0012_rbac_roles.sql',
  '0013_resident_submissions.sql',
  '0014_bids_parsed_pdf_text.sql',
  '0015_plaid_items.sql',
  '0016_hoa_document_versions.sql',
  '0017_leases_and_property_360.sql',
  '0018_communications.sql',
  '0019_meeting_action_items.sql',
  '0019_platform_admin.sql',
  '0020_recurring_events.sql',
  '0021_event_notify_config.sql',
  '0021_search_rpc_loosen.sql',
  '0022_soft_delete.sql',
  '0023_fix_section_sign_encoding.sql',
  '0024_tickets.sql',
  '0025_archive_tenant.sql',
  '0026_submission_threads.sql',
  '0027_submission_attachments.sql',
  '0028_property_bridge_backfill.sql',
  '0029_inbox.sql',
  '0030_inbox_message_uniq_scope.sql',
  '0031_inbox_attachment_uniq.sql',
  '0032_mailbox_backfill_watchdog.sql',
  '0033_inbox_sender_alias_uniq.sql',
  '0034_inbox_reply_embeddings.sql',
  '0034a_reset_backfill_for_sent_mail.sql',
  '0034b_search_reply_embeddings.sql',
  '0034c_reply_embeddings_skip_marker.sql',
  '0035_inbox_drafts.sql',
  '0036_ai_runs_board_only.sql',
  '0037_inbox_vendor_assignment.sql',
  '0038_dashboard_daily_snapshots.sql',
  '0038_inbox_outbound_recipients.sql',
  '0039_inbox_draft_attachments.sql',
  '0039_property_list_view.sql',
  '0040_inbox_draft_attachment_path_scope.sql',
  '0040_property_list_view_board_predicate.sql',
  '0041_property_residents_write_gate.sql',
  '0042_inbox_vendor_request.sql',
  '0043_inbox_gmail_state.sql',
  '0044_community_templates.sql',
  '0045_property_list_view_review_fixes.sql',
  '0046_property_list_attention_split.sql',
  // 0047_collections.sql embeds one-tenant data remediation (a hardcoded
  // Madison Park AR assertion of exactly $9,475.88) that can never hold on
  // an empty database. The historical file is unchanged; this replay-only
  // variant omits just that DO block. See migrations/replay/0047_collections.schema-only.sql
  // and migrations/0047_collections.sql for the full reasoning. Do not
  // "fix" this back to '0047_collections.sql' — it will break the replay.
  'replay/0047_collections.schema-only.sql',
  '0048_inbox_org_scoped_identity.sql',
  '0049_mailbox_reconcile_error.sql',
  '0050_communication_rendered_subject.sql',
  '0051_property_list_waiting_list.sql',
  '0052_announcements_last_viewed.sql',
  '0053_ticket_notifications.sql',
  '0054_org_members_insert_scope.sql',
  '0055_storage_org_prefix_scope.sql',
  '0056_governing_docs_org_scope.sql',
  '0057_bank_txn_reconciliation_attempted.sql',
  '0058_org_members_role_scope.sql',
  '0059_storage_delete_update.sql',
  '0060_approval_requests.sql',
  '0061_accounting_rls.sql',
  '0062_state_law_ingestion.sql',
  '0063_rls_sweep.sql',
  '0064_m1_batch.sql',
  '0065_m2_prep.sql',
  '0066_records_requests.sql',
  '0067_m3_batch.sql',
  '0068_m4_batch.sql',
  // M5: part 1 BL-137 dues_rates (security/m5-dues-rates.test.ts), part 3
  // BL-143 owner_join_* (security/m5-join-requests.test.ts), part 4 BL-145
  // compliance_deadlines_done.document_id (security/m5-compliance-evidence.test.ts).
  // One file, one entry: later parts append to it.
  '0069_m5_batch.sql',
  // M6: BL-168 professional and officer roles (security/m6-roles.test.ts).
  // One file, one entry: BL-156 and BL-166 append to it.
  '0070_m6_roles.sql',
]

/**
 * Storage buckets. `migrations/0003_storage_policies.sql` writes policies
 * against these three buckets but never creates them — they were
 * provisioned out of band in production, so replay must create them or
 * every storage test fails on a missing bucket.
 *
 * `governing-docs` is a fourth bucket, also provisioned out of band in
 * production (confirmed via storage.listBuckets() against prod — not
 * created by any migration), added here alongside 0056's policies. This
 * manifest is the ONLY place the local stack learns about a bucket that
 * exists in production: a bucket created through the dashboard and never
 * added here silently escapes all test coverage — no error, no failing
 * test, just a bucket nothing ever checks.
 */
export const STORAGE_BUCKETS = [
  'hoa-photos',
  'hoa-documents',
  'eviction-docs',
  'governing-docs',
] as const

/**
 * Seeds that are schema prerequisites rather than per-test fixtures.
 * The 19 global community templates (organization_id IS NULL) are asserted
 * on by scripts/test-community-templates.ts.
 */
export const SCHEMA_SEEDS: string[] = ['seed-community-templates.sql']
