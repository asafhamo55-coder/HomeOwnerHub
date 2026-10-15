/**
 * Status registry for the community-operations domains — one place for the
 * tone + label of every status the board sees (design system v2 §6 rule 4,
 * UX plan "STATUS registry"). Pages render these through
 * `<StatusBadge status tones labels />` so a ticket that is "In progress"
 * looks the same on /tickets, /tickets/[id] and the dashboard.
 *
 * Plain module (no "use server", no React) so client and server components
 * can both import it.
 *
 * Tone semantics, applied consistently across domains:
 *   warning — needs the board's attention / waiting on the board
 *   info    — in motion, someone is working it
 *   success — done, approved, delivered
 *   danger  — failed, denied, escalated, a penalty is running
 *   neutral — inert: draft, withdrawn, dismissed, cancelled
 */
import type { StatusTone } from '@homeowner-portal/ui'

export interface StatusVocabulary {
  tones: Record<string, StatusTone>
  labels: Record<string, string>
}

/** Build a vocabulary from `{ status: [tone, label] }`. */
function vocab(entries: Record<string, readonly [StatusTone, string]>): StatusVocabulary {
  const tones: Record<string, StatusTone> = {}
  const labels: Record<string, string> = {}
  for (const [k, [tone, label]] of Object.entries(entries)) {
    tones[k] = tone
    labels[k] = label
  }
  return { tones, labels }
}

// Covers both the DB check constraint (open, notice_drafted, notice_sent,
// resolved, waived) and the app's editable set (lib/violation-statuses.ts:
// fined, dismissed) plus legacy rows (cured, escalated).
export const VIOLATION_STATUS = vocab({
  open: ['warning', 'Open'],
  notice_drafted: ['info', 'Notice drafted'],
  notice_sent: ['info', 'Notice sent'],
  fined: ['danger', 'Fined'],
  escalated: ['danger', 'At attorney'],
  cured: ['success', 'Cured'],
  resolved: ['success', 'Resolved'],
  waived: ['neutral', 'Waived'],
  dismissed: ['neutral', 'Dismissed'],
})

export const VIOLATION_SEVERITY = vocab({
  low: ['neutral', 'Low'],
  medium: ['warning', 'Medium'],
  high: ['danger', 'High'],
})

export const VIOLATION_REPORT_STATUS = vocab({
  submitted: ['warning', 'New'],
  under_review: ['info', 'Under review'],
  opened_as_violation: ['danger', 'Opened as violation'],
  closed_no_action: ['neutral', 'Closed, no action'],
  dismissed: ['neutral', 'Dismissed'],
})

export const VIOLATION_REPORT_CATEGORY: Record<string, string> = {
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

export const TICKET_STATUS = vocab({
  open: ['warning', 'Open'],
  in_progress: ['info', 'In progress'],
  closed: ['success', 'Closed'],
})

export const TICKET_PRIORITY = vocab({
  urgent: ['danger', 'Urgent'],
  high: ['warning', 'High'],
  normal: ['neutral', 'Normal'],
  low: ['neutral', 'Low'],
})

export const TICKET_CATEGORY: Record<string, string> = {
  maintenance: 'Maintenance',
  noise: 'Noise',
  parking: 'Parking',
  common_area: 'Common area',
  billing: 'Billing',
  access: 'Access',
  safety: 'Safety',
  general: 'General',
  other: 'Other',
}

export const ARC_STATUS = vocab({
  submitted: ['warning', 'Submitted'],
  in_review: ['info', 'In review'],
  approved: ['success', 'Approved'],
  denied: ['danger', 'Denied'],
  withdrawn: ['neutral', 'Withdrawn'],
})

export const ARC_CATEGORY: Record<string, string> = {
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

export const MEETING_STATUS = vocab({
  draft: ['neutral', 'Draft'],
  in_progress: ['info', 'In progress'],
  approved: ['success', 'Approved'],
  archived: ['neutral', 'Archived'],
})

export const MEETING_TYPE: Record<string, string> = {
  regular: 'Regular',
  special: 'Special',
  annual: 'Annual',
  emergency: 'Emergency',
}

export const ACTION_ITEM_STATUS = vocab({
  open: ['warning', 'Open'],
  in_progress: ['info', 'In progress'],
  done: ['success', 'Done'],
  cancelled: ['neutral', 'Cancelled'],
})

export const COMMUNICATION_STATUS = vocab({
  draft: ['neutral', 'Draft'],
  scheduled: ['info', 'Scheduled'],
  sending: ['info', 'Sending'],
  sent: ['success', 'Sent'],
  failed: ['danger', 'Failed'],
  cancelled: ['neutral', 'Cancelled'],
})

export const COMMUNICATION_CATEGORY: Record<string, string> = {
  welcome: 'Welcome',
  dues: 'Dues',
  meeting: 'Meeting',
  violation: 'Violation',
  arc: 'ARC',
  financial: 'Financial',
  emergency: 'Emergency',
  announcement: 'Announcement',
  community: 'Community',
  custom: 'Custom',
}

export const DELIVERY_STATUS = vocab({
  queued: ['neutral', 'Queued'],
  sent: ['info', 'Sent'],
  delivered: ['success', 'Delivered'],
  opened: ['success', 'Opened'],
  clicked: ['success', 'Clicked'],
  replied: ['success', 'Replied'],
  bounced: ['danger', 'Bounced'],
  failed: ['danger', 'Failed'],
  suppressed: ['warning', 'Suppressed'],
})

export const INBOX_THREAD_STATUS = vocab({
  needs_review: ['warning', 'Needs review'],
  open: ['info', 'Open'],
  waiting: ['neutral', 'Waiting'],
  closed: ['success', 'Closed'],
})

export const WAITING_LIST_STATUS = vocab({
  waiting: ['warning', 'Waiting'],
  approved: ['success', 'Approved'],
  withdrawn: ['neutral', 'Withdrawn'],
  denied: ['danger', 'Denied'],
})

export const TENURE = vocab({
  owner_occupied: ['success', 'Owner-occupied'],
  leased: ['info', 'Leased'],
  unknown: ['neutral', 'Unknown'],
})
