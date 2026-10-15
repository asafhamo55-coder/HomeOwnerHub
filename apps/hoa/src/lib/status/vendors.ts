import type { StatusTone } from '@homeowner-portal/ui'

/**
 * One status vocabulary for the vendor domain — vendors, COI compliance,
 * onboarding invitations, RFPs, bids, RFP invitations and the bid
 * comparison's line-item states. Every vendor/RFP page reads its tones and
 * labels from here (design-system v2 §6 rule 4), so a status reads the
 * same on a list, a detail page and a dashboard row.
 *
 * Pair with `StatusBadge status tones labels` (icon + text, never colour
 * alone).
 */

type ToneMap<K extends string> = Record<K, StatusTone>
type Labels<K extends string> = Record<K, string>

// ─── Vendor record ───────────────────────────────────────────────────

export type VendorStatusKey = 'prospect' | 'active' | 'inactive' | 'blacklisted'

export const VENDOR_STATUS_TONES: ToneMap<VendorStatusKey> = {
  prospect: 'info',
  active: 'success',
  inactive: 'neutral',
  blacklisted: 'danger',
}

export const VENDOR_STATUS_LABELS: Labels<VendorStatusKey> = {
  prospect: 'Prospect',
  active: 'Active',
  inactive: 'Inactive',
  blacklisted: 'Blocked',
}

// ─── COI / compliance grade ─────────────────────────────────────────

export type ComplianceKey = 'green' | 'yellow' | 'red' | 'missing' | 'none'

export const COMPLIANCE_TONES: ToneMap<ComplianceKey> = {
  green: 'success',
  yellow: 'warning',
  red: 'danger',
  missing: 'neutral',
  none: 'neutral',
}

export const COMPLIANCE_LABELS: Labels<ComplianceKey> = {
  green: 'Compliant',
  yellow: 'Action soon',
  red: 'Non-compliant',
  missing: 'Docs missing',
  none: 'Not reviewed',
}

/** Longer explanation for forms (manual override). */
export const COMPLIANCE_HELP: Labels<Exclude<ComplianceKey, 'none'>> = {
  green: 'All required documents on file and valid.',
  yellow: 'Minor gaps; will become a problem in 30–60 days.',
  red: 'Major gap; do not assign work until cured.',
  missing: 'Vendor has not submitted documents yet.',
}

/** Compliance key for a nullable grade: no row reads "Not reviewed". */
export function complianceKey(status: string | null | undefined): ComplianceKey {
  return status === 'green' || status === 'yellow' || status === 'red' || status === 'missing'
    ? status
    : 'none'
}

/** Deficiency severity from the W21 grader ('red' | 'yellow' | …). */
export const DEFICIENCY_TONES: Record<string, StatusTone> = {
  red: 'danger',
  yellow: 'warning',
  green: 'success',
}

export const DEFICIENCY_LABELS: Record<string, string> = {
  red: 'Blocking',
  yellow: 'Follow up',
  green: 'OK',
}

// ─── Vendor onboarding invitations ──────────────────────────────────

export type InvitationKey = 'pending' | 'submitted' | 'expired' | 'revoked'

export const INVITATION_STATUS_TONES: ToneMap<InvitationKey> = {
  pending: 'info',
  submitted: 'success',
  expired: 'warning',
  revoked: 'neutral',
}

export const INVITATION_STATUS_LABELS: Labels<InvitationKey> = {
  pending: 'Awaiting vendor',
  submitted: 'Submitted',
  expired: 'Link expired',
  revoked: 'Revoked',
}

// ─── RFPs ────────────────────────────────────────────────────────────

export type RfpStatusKey = 'draft' | 'open' | 'evaluation' | 'awarded' | 'cancelled'

export const RFP_STATUS_TONES: ToneMap<RfpStatusKey> = {
  draft: 'neutral',
  open: 'info',
  evaluation: 'warning',
  awarded: 'success',
  cancelled: 'neutral',
}

export const RFP_STATUS_LABELS: Labels<RfpStatusKey> = {
  draft: 'Draft',
  open: 'Open for bids',
  evaluation: 'In evaluation',
  awarded: 'Awarded',
  cancelled: 'Cancelled',
}

// ─── Bids ────────────────────────────────────────────────────────────

export type BidStatusKey = 'draft' | 'submitted' | 'withdrawn' | 'declined' | 'awarded'

export const BID_STATUS_TONES: ToneMap<BidStatusKey> = {
  draft: 'neutral',
  submitted: 'info',
  withdrawn: 'neutral',
  declined: 'danger',
  awarded: 'success',
}

export const BID_STATUS_LABELS: Labels<BidStatusKey> = {
  draft: 'Draft',
  submitted: 'Submitted',
  withdrawn: 'Withdrawn',
  declined: 'Declined',
  awarded: 'Awarded',
}

// ─── Bid comparison cells ───────────────────────────────────────────

export type ComparisonCellKey = 'matched' | 'excluded' | 'addition'

export const COMPARISON_CELL_TONES: ToneMap<ComparisonCellKey> = {
  matched: 'success',
  excluded: 'danger',
  addition: 'warning',
}

export const COMPARISON_CELL_LABELS: Labels<ComparisonCellKey> = {
  matched: 'Matched',
  excluded: 'Excluded',
  addition: 'Addition',
}
