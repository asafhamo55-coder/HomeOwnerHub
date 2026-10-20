import { StatusBadge, type StatusTone } from '@homeowner-portal/ui'

// One status vocabulary for the resident portal (design-system v2 rule 4):
// every list and detail screen renders a submission's status through
// <ResidentStatus>, so "in_review" reads the same everywhere and is never
// colour-only (StatusPill adds an icon). Labels are resident-facing copy.

type Kind = 'ticket' | 'arc' | 'report' | 'violation'

const TONES: Record<Kind, Record<string, StatusTone>> = {
  ticket: { open: 'info', in_progress: 'warning', closed: 'success' },
  arc: { submitted: 'info', in_review: 'warning', approved: 'success', denied: 'danger', withdrawn: 'neutral' },
  report: {
    submitted: 'info',
    under_review: 'warning',
    opened_as_violation: 'brand',
    closed_no_action: 'neutral',
    dismissed: 'neutral',
  },
  violation: {
    open: 'warning',
    notice_sent: 'warning',
    pending_approval: 'warning',
    escalated: 'danger',
    hearing_scheduled: 'danger',
    fined: 'danger',
    resolved: 'success',
    closed: 'success',
    waived: 'neutral',
    dismissed: 'neutral',
  },
}

const LABELS: Record<Kind, Record<string, string>> = {
  ticket: { open: 'Open', in_progress: 'In progress', closed: 'Closed' },
  arc: { submitted: 'Submitted', in_review: 'In review', approved: 'Approved', denied: 'Denied', withdrawn: 'Withdrawn' },
  report: {
    submitted: 'Submitted',
    under_review: 'Under review',
    opened_as_violation: 'Action taken',
    closed_no_action: 'Closed',
    dismissed: 'Dismissed',
  },
  violation: { notice_sent: 'Notice sent', pending_approval: 'Pending', hearing_scheduled: 'Hearing scheduled' },
}

export function ResidentStatus({ kind, status }: { kind: Kind; status: string }) {
  return <StatusBadge status={status} tones={TONES[kind]} labels={LABELS[kind]} />
}

export function residentStatusLabel(kind: Kind, status: string): string {
  return LABELS[kind][status] ?? status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export const TICKET_CATEGORY_LABEL: Record<string, string> = {
  maintenance: 'Maintenance',
  noise: 'Noise',
  parking: 'Parking',
  common_area: 'Common area',
  billing: 'Billing',
  access: 'Access',
  safety: 'Safety',
  general: 'General',
  other: 'Other',
  records_request: 'Records request',
}

export const ARC_CATEGORY_LABEL: Record<string, string> = {
  paint: 'Paint',
  fence: 'Fence',
  deck_patio: 'Deck / patio',
  roof: 'Roof',
  landscaping: 'Landscaping',
  addition: 'Addition',
  pool: 'Pool / spa',
  solar: 'Solar',
  other: 'Other',
}

export const REPORT_CATEGORY_LABEL: Record<string, string> = {
  parking: 'Parking',
  pet: 'Pet',
  noise: 'Noise',
  lawn_landscape: 'Lawn / landscape',
  trash: 'Trash',
  architectural: 'Architectural',
  rental: 'Rental',
  nuisance: 'Nuisance',
  other: 'Other',
}
