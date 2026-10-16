// BL-011 full data export — what goes in the zip.
//
// An explicit per-table column ALLOWLIST. Never '*': a column added to a
// table later must be added here on purpose, after someone decides it is
// safe to hand out in bulk. tables.test.ts fails on any column that looks
// like a credential, and on any of NEVER_EXPORTED_TABLES appearing here.
//
// Column names are type-checked against the generated Database types, so a
// typo or a dropped column breaks `pnpm typecheck`, not the download.
//
// Left out on purpose:
//   - internal auth ids (created_by, owner_user_id, submitted_by …) — they
//     mean nothing outside this app;
//   - vendors.ein — sole proprietors often use their SSN as the TIN;
//   - hoa_violations.photo_urls — storage URLs, possibly signed;
//   - parsed_text / raw_transcript / ai drafts — large derived text.

import type { Database } from '@homeowner-portal/db/types'

type Tables = Database['public']['Tables']
type TableName = keyof Tables
type Col<T extends TableName> = Extract<keyof Tables[T]['Row'], string>

export interface ExportTable<T extends TableName = TableName> {
  /** Zip entry name. */
  file: string
  table: T
  /** What a board member would call it, for the settings card. */
  label: string
  /** The org scope column (tables predate a single naming convention). */
  orgColumn: Col<T>
  /** Soft-delete column; rows with it set are left out. */
  deletedColumn?: Col<T>
  columns: readonly Col<T>[]
}

function table<T extends TableName>(def: ExportTable<T>): ExportTable {
  return def as unknown as ExportTable
}

export const EXPORT_TABLES: readonly ExportTable[] = [
  table({
    file: 'units.csv',
    table: 'units',
    label: 'Units',
    orgColumn: 'organization_id',
    columns: [
      'id', 'unit_number', 'address_line1', 'address_line2', 'city', 'state', 'postal_code',
      'lot_number', 'bedrooms', 'bathrooms', 'square_feet', 'legacy_hoa_property_id', 'notes',
      'created_at', 'updated_at',
    ],
  }),
  table({
    file: 'properties.csv',
    table: 'hoa_properties',
    label: 'Properties list',
    orgColumn: 'org_id',
    deletedColumn: 'deleted_at',
    columns: [
      'id', 'address', 'unit_number', 'owner_name', 'owner_email', 'owner_phone', 'tenure',
      'notes', 'created_at', 'updated_at',
    ],
  }),
  table({
    file: 'owners.csv',
    table: 'ownerships',
    label: 'Owners',
    orgColumn: 'organization_id',
    columns: [
      'id', 'unit_id', 'owner_name', 'owner_email', 'owner_phone', 'ownership_pct', 'valid_from',
      'valid_to', 'source', 'created_at',
    ],
  }),
  table({
    file: 'residents.csv',
    table: 'property_residents',
    label: 'Residents',
    orgColumn: 'organization_id',
    deletedColumn: 'deleted_at',
    columns: [
      'id', 'property_id', 'full_name', 'email', 'phone', 'role', 'is_primary', 'moved_in_at',
      'moved_out_at', 'notes', 'created_at',
    ],
  }),
  table({
    file: 'assessments.csv',
    table: 'assessments',
    label: 'Assessments',
    orgColumn: 'organization_id',
    deletedColumn: 'deleted_at',
    columns: [
      'id', 'unit_id', 'fiscal_period_id', 'assessment_type', 'amount', 'due_date', 'status',
      'memo_code', 'created_at',
    ],
  }),
  table({
    file: 'payments.csv',
    table: 'payments',
    label: 'Payments',
    orgColumn: 'organization_id',
    columns: [
      'id', 'unit_id', 'assessment_id', 'invoice_id', 'amount', 'paid_at', 'payment_method',
      'external_ref', 'journal_entry_id', 'created_at',
    ],
  }),
  table({
    file: 'journal_entries.csv',
    table: 'journal_entries',
    label: 'Journal entries',
    orgColumn: 'organization_id',
    columns: [
      'id', 'entry_number', 'entry_date', 'fiscal_period_id', 'memo', 'source', 'status',
      'posted_at', 'reverses_id', 'reversed_by_id', 'created_at',
    ],
  }),
  table({
    file: 'journal_lines.csv',
    table: 'ledger_entries',
    label: 'Journal lines',
    orgColumn: 'organization_id',
    columns: ['id', 'journal_entry_id', 'account_id', 'fund_id', 'debit_amount', 'credit_amount', 'memo'],
  }),
  table({
    file: 'violations.csv',
    table: 'hoa_violations',
    label: 'Violations',
    orgColumn: 'org_id',
    deletedColumn: 'deleted_at',
    columns: [
      'id', 'property_id', 'violation_type', 'description', 'ccr_section', 'severity', 'status',
      'cure_period_days', 'fine_amount', 'fine_start_date', 'notice_sent_at', 'approved_letter',
      'approved_at', 'resolved_at', 'resolution_note', 'created_at', 'updated_at',
    ],
  }),
  table({
    file: 'arc_requests.csv',
    table: 'arc_requests',
    label: 'ARC requests',
    orgColumn: 'organization_id',
    deletedColumn: 'deleted_at',
    columns: [
      'id', 'unit_id', 'category', 'summary', 'scope_description', 'contractor_name',
      'contractor_license', 'proposed_start', 'proposed_completion', 'status', 'submitted_at',
      'board_response', 'board_response_at',
    ],
  }),
  table({
    file: 'tickets.csv',
    table: 'tickets',
    label: 'Tickets',
    orgColumn: 'organization_id',
    deletedColumn: 'deleted_at',
    columns: [
      'id', 'unit_id', 'category', 'subject', 'description', 'priority', 'status', 'created_at',
      'updated_at', 'closed_at',
    ],
  }),
  table({
    file: 'documents.csv',
    table: 'hoa_documents',
    label: 'Documents index',
    orgColumn: 'org_id',
    columns: ['id', 'name', 'type', 'file_size', 'storage_path', 'parsed_at', 'created_at'],
  }),
  table({
    file: 'governing_documents.csv',
    table: 'governing_documents',
    label: 'Governing docs',
    orgColumn: 'organization_id',
    columns: [
      'id', 'title', 'type', 'effective_date', 'superseded_at', 'file_size', 'storage_path',
      'created_at', 'updated_at',
    ],
  }),
  table({
    file: 'vendors.csv',
    table: 'vendors',
    label: 'Vendors',
    orgColumn: 'organization_id',
    deletedColumn: 'deleted_at',
    columns: [
      'id', 'legal_name', 'dba', 'status', 'trades', 'primary_email', 'primary_phone', 'address',
      'service_area_zips', 'notes', 'created_at',
    ],
  }),
  table({
    file: 'meetings.csv',
    table: 'hoa_meeting_minutes',
    label: 'Meetings',
    orgColumn: 'org_id',
    deletedColumn: 'deleted_at',
    columns: [
      'id', 'meeting_date', 'meeting_type', 'status', 'attendees', 'ai_summary', 'motions',
      'action_items', 'approved_at', 'created_at', 'updated_at',
    ],
  }),
]

/**
 * Tables that must never appear in the export, whatever columns someone
 * later picks: credentials, signed settings, and audit/admin records.
 */
export const NEVER_EXPORTED_TABLES = [
  'plaid_items', // access_token
  'push_subscriptions', // endpoint keys
  'mailbox_accounts',
  'mailbox_account_secrets', // OAuth refresh tokens
  'payment_methods',
  'bank_accounts',
  'vendor_onboarding_invitations', // invite tokens
  'rfp_invitations', // bid tokens
  'associations', // compliance_settings carries HMAC-signed values
  'audit_log',
  'platform_admins',
  'platform_admin_audit',
] as const satisfies readonly TableName[]
