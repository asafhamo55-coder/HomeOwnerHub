// BL-115 — the board activity log's vocabulary. Plain module (no server
// imports) so the page, the CSV export and BL-117's handover kit share it.
//
// One map from an audit_log `action` to plain language and an area. An
// action not in the map is shown raw (never hidden): a new writer appears
// in the log on day one, just without a friendly label.
//
// Metadata is NEVER shown as JSON. Some writers keep free text a board
// member typed (a rejection reason, an override summary) or contact
// details (eviction reminders) in it, so only the keys listed per action
// in `ACTION_DETAIL` are read, and only as numbers or known enum strings.

import { propertyHref } from '@/lib/properties/href'
import { asPropertyId } from '@/lib/properties/resolve'

export type ActivityArea =
  | 'violations'
  | 'vendors'
  | 'properties'
  | 'accounting'
  | 'collections'
  | 'communications'
  | 'records'
  | 'access'
  | 'billing'
  | 'ai'
  | 'other'

export const ACTIVITY_AREA_LABEL: Record<ActivityArea, string> = {
  violations: 'Violations',
  vendors: 'Vendors',
  properties: 'Properties & owners',
  accounting: 'Accounting',
  collections: 'Collections',
  communications: 'Messages & consent',
  records: 'Records & exports',
  access: 'Access',
  billing: 'Billing',
  ai: 'AI usage',
  other: 'Other',
}

/** Filter order on the page. */
export const ACTIVITY_AREAS: readonly ActivityArea[] = [
  'violations',
  'vendors',
  'properties',
  'accounting',
  'collections',
  'communications',
  'records',
  'access',
  'billing',
  'ai',
]

interface ActionDef {
  label: string
  area: ActivityArea
}

/** The action this page's own CSV export writes (BL-115: the export is itself audited). */
export const ACTIVITY_EXPORT_ACTION = 'activity_log_export'

/** BL-121: the year-end CPA package download. */
export const YEAR_END_EXPORT_ACTION = 'year_end_package_export'

export const ACTION_LABELS: Record<string, ActionDef> = {
  // Violations
  'violation.cure_commitment.recorded': { label: 'Recorded an owner’s cure commitment', area: 'violations' },
  'violation.cure_commitment.withdrawn': { label: 'Withdrew a cure commitment', area: 'violations' },
  // Vendors
  'vendor.rejected': { label: 'Rejected a vendor', area: 'vendors' },
  'vendor.compliance.manual_override': { label: 'Overrode a vendor’s insurance status', area: 'vendors' },
  // Properties & owners
  properties_import: { label: 'Imported the property roster', area: 'properties' },
  estoppel_prepared: { label: 'Prepared an estoppel certificate', area: 'properties' },
  estoppel_printed: { label: 'Printed an estoppel certificate', area: 'properties' },
  'resident.contact_update.applied': { label: 'Approved a resident’s contact update', area: 'properties' },
  'resident.contact_update.rejected': { label: 'Declined a resident’s contact update', area: 'properties' },
  // Accounting
  fiscal_year_opened: { label: 'Opened the next fiscal year', area: 'accounting' },
  'recurring_je.paused': { label: 'Paused a recurring entry', area: 'accounting' },
  'recurring_je.resumed': { label: 'Resumed a recurring entry', area: 'accounting' },
  'recurring_je.stopped': { label: 'Stopped a recurring entry', area: 'accounting' },
  'recurring_je.updated': { label: 'Edited a recurring entry', area: 'accounting' },
  'bank_account.manual_created': { label: 'Added a manual bank account', area: 'accounting' },
  'bank_import.committed': { label: 'Imported a bank statement', area: 'accounting' },
  // Collections
  collections_letter_printed: { label: 'Printed a collections letter', area: 'collections' },
  'payment_plan.completed': { label: 'Payment plan paid off', area: 'collections' },
  eviction_filing_eligible: { label: 'Eviction case became eligible to file', area: 'collections' },
  // Messages & consent
  sms_consent_granted: { label: 'Text messages turned on for a number', area: 'communications' },
  sms_consent_revoked: { label: 'Text messages turned off for a number', area: 'communications' },
  // Records & exports
  data_export: { label: 'Downloaded all association data', area: 'records' },
  statutory_roster_export: { label: 'Exported the owner roster', area: 'records' },
  [ACTIVITY_EXPORT_ACTION]: { label: 'Exported the activity log', area: 'records' },
  [YEAR_END_EXPORT_ACTION]: { label: 'Downloaded the year-end package for the CPA', area: 'accounting' },
  // Access
  'resident_portal.enter': { label: 'Viewed the portal as a resident', area: 'access' },
  'resident_portal.exit': { label: 'Left the resident view', area: 'access' },
  'resident_portal.refused': { label: 'Resident view was refused', area: 'access' },
  // Billing
  'billing.subscription_updated': { label: 'Subscription changed', area: 'billing' },
  'billing.invoice_payment_failed': { label: 'Subscription payment failed', area: 'billing' },
  'billing.band_sync': { label: 'Plan size updated to match homes', area: 'billing' },
  'billing.renewal_notice': { label: 'Renewal notice sent', area: 'billing' },
  'billing.renewal_switch': { label: 'Plan switched at renewal', area: 'billing' },
  wizard_draft_reminder: { label: 'Reminder sent about an unfinished draft', area: 'other' },
  // AI usage (ledger rows; hidden unless the AI filter is picked)
  inbox_draft_metrics: { label: 'Sent an AI-drafted reply', area: 'ai' },
}

/** Prefix families: one label for every bucket of a dynamic action name. */
const ACTION_PREFIXES: Array<{ prefix: string; label: string; area: ActivityArea }> = [
  { prefix: 'ai.usage.', label: 'Used an AI feature', area: 'ai' },
  { prefix: 'ai.spend.notice.', label: 'AI spending notice sent', area: 'ai' },
]

/**
 * The AI rows are a usage ledger (one per AI call, BL-078), so they would
 * bury everything a person did. The default view leaves them out; the AI
 * area filter shows them. Exact actions and LIKE prefixes, for the query.
 */
export const AI_LEDGER_EXACT: readonly string[] = ['inbox_draft_metrics']
export const AI_LEDGER_PREFIXES: readonly string[] = ['ai.usage.', 'ai.spend.notice.']

export function actionArea(action: string): ActivityArea {
  const exact = ACTION_LABELS[action]
  if (exact) return exact.area
  const p = ACTION_PREFIXES.find((x) => action.startsWith(x.prefix))
  return p ? p.area : 'other'
}

/** Plain language for an action; an unknown action is shown as stored. */
export function actionLabel(action: string): string {
  const exact = ACTION_LABELS[action]
  if (exact) return exact.label
  const p = ACTION_PREFIXES.find((x) => action.startsWith(x.prefix))
  if (p) {
    const rest = action.slice(p.prefix.length).replace(/[._]/g, ' ').trim()
    return rest ? `${p.label} (${rest})` : p.label
  }
  return action
}

/** The exact action names in an area (the prefix families are handled by the query). */
export function actionsInArea(area: ActivityArea): string[] {
  return Object.entries(ACTION_LABELS)
    .filter(([, d]) => d.area === area)
    .map(([a]) => a)
}

export function prefixesInArea(area: ActivityArea): string[] {
  return ACTION_PREFIXES.filter((p) => p.area === area).map((p) => p.prefix)
}

export function isActivityArea(v: unknown): v is ActivityArea {
  return typeof v === 'string' && v in ACTIVITY_AREA_LABEL
}

// ── Entity links ─────────────────────────────────────────────────────

const ENTITY_LABEL: Record<string, string> = {
  hoa_violation: 'Violation',
  vendor: 'Vendor',
  ticket: 'Ticket',
  hoa_property: 'Property',
  recurring_journal_entry: 'Recurring entry',
  payment_plan: 'Payment plan',
  collections_letter: 'Collections letter',
  resident_communication_preferences: 'Resident preferences',
  inbox_draft: 'Inbox reply',
  eviction_case: 'Eviction case',
  wizard_draft: 'Draft',
  ai_run: 'AI run',
  org: 'Association',
  association: 'Association',
  subscription: 'Subscription',
  stripe_subscription: 'Subscription',
  stripe_invoice: 'Subscription invoice',
  recurring_event: 'Recurring event',
  vendor_coi: 'Vendor insurance',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The page a row's entity lives on, or null when it has none the board can open. */
export function entityHref(entityType: string | null, entityId: string | null): string | null {
  if (!entityType) return null
  const id = entityId && UUID.test(entityId) ? entityId : null
  switch (entityType) {
    case 'hoa_violation':
      return id ? `/violations/${id}` : null
    case 'vendor':
      return id ? `/vendors/${id}` : null
    case 'ticket':
      return id ? `/tickets/${id}` : null
    case 'hoa_property':
      return id ? propertyHref(asPropertyId(id)) : null
    case 'recurring_journal_entry':
      return '/accounting/recurring'
    default:
      return null
  }
}

export function entityLabel(entityType: string | null): string | null {
  if (!entityType) return null
  return ENTITY_LABEL[entityType] ?? entityType.replace(/_/g, ' ')
}

// ── Metadata allowlist ───────────────────────────────────────────────

type Meta = Record<string, unknown> | null | undefined

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function oneOf<T extends string>(v: unknown, allowed: Record<T, string>): string | null {
  return typeof v === 'string' && v in allowed ? allowed[v as T] : null
}

const ROSTER_KIND = { owners: 'Owner roster', voters: 'Voter list', records: 'Records-request copy' } as const
const FORMAT = { csv: 'CSV', print: 'Printed' } as const
const COMPLIANCE_STATUS = {
  green: 'Set to compliant',
  yellow: 'Set to expiring soon',
  red: 'Set to not compliant',
  missing: 'Set to missing',
} as const

/**
 * A short plain-text detail from an allowlist of metadata keys per action.
 * Anything not listed here is never read, so free text and contact details
 * a writer kept in metadata cannot reach the page or the CSV.
 */
export const ACTION_DETAIL: Record<string, (m: Record<string, unknown>) => string | null> = {
  statutory_roster_export: (m) => {
    const parts = [oneOf(m.kind, ROSTER_KIND), oneOf(m.format, FORMAT)].filter(Boolean)
    return parts.length ? parts.join(' · ') : null
  },
  properties_import: (m) => {
    const rows = m.rows && typeof m.rows === 'object' ? num((m.rows as Record<string, unknown>).total) : null
    return rows != null ? `${rows} ${rows === 1 ? 'row' : 'rows'}` : null
  },
  'vendor.compliance.manual_override': (m) => oneOf(m.new_status, COMPLIANCE_STATUS),
  'bank_import.committed': (m) => {
    const inserted = num(m.inserted)
    const duplicates = num(m.duplicates)
    if (inserted == null) return null
    const added = `${inserted} ${inserted === 1 ? 'transaction' : 'transactions'} added`
    return duplicates ? `${added} · ${duplicates} already in` : added
  },
  [ACTIVITY_EXPORT_ACTION]: (m) => {
    const rows = num(m.rows)
    return rows != null ? `${rows} ${rows === 1 ? 'row' : 'rows'}` : null
  },
  [YEAR_END_EXPORT_ACTION]: (m) =>
    typeof m.fiscal_start === 'string' && typeof m.fiscal_end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.fiscal_start) && /^\d{4}-\d{2}-\d{2}$/.test(m.fiscal_end)
      ? `Fiscal year ${m.fiscal_start} to ${m.fiscal_end}`
      : null,
}

export function actionDetail(action: string, metadata: Meta): string | null {
  const fn = ACTION_DETAIL[action]
  if (!fn || !metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  try {
    return fn(metadata)
  } catch {
    return null
  }
}
