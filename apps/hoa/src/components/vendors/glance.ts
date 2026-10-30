import { coiBucket, coiDays, type CoiBucket } from '@/app/(dashboard)/vendors/coi-filter'

/**
 * Pure model for the vendor detail at-a-glance header. The COI chip uses
 * the same `coiBucket` rule as the /vendors list, so the two always agree.
 * No server imports, so a client file may use it too.
 */

export interface GlanceBid {
  status: string
  rfp_id: string
  rfp_status: string | null
  submitted_at: string | null
}

export interface GlanceInput {
  legalName: string
  createdAt: string
  coi: { status: string | null; coi_expiration_date: string | null } | null
  lastReviewedAt: string | null
  documentDates: readonly string[]
  bids: readonly GlanceBid[]
}

export interface Glance {
  coiBucket: CoiBucket
  coiLabel: string
  coiTone: 'danger' | 'warning' | 'success' | 'neutral'
  daysToExpiry: number | null
  daysLabel: string
  openBids: number
  openRfps: number
  awardedBids: number
  lastActivity: string | null
}

const OPEN_BID = new Set(['draft', 'submitted'])
const OPEN_RFP = new Set(['open', 'evaluation'])

export const COI_CHIP: Record<CoiBucket, { label: string; tone: Glance['coiTone'] }> = {
  expired: { label: 'Insurance expired', tone: 'danger' },
  expiring: { label: 'Insurance expiring', tone: 'warning' },
  ok: { label: 'Insurance current', tone: 'success' },
  missing: { label: 'Insurance missing', tone: 'neutral' },
}

export function daysLabel(days: number | null): string {
  if (days === null) return 'No expiry on file'
  if (days === 0) return 'Expires today'
  if (days < 0) return `Expired ${-days} ${-days === 1 ? 'day' : 'days'} ago`
  return `${days} ${days === 1 ? 'day' : 'days'} left`
}

export function buildGlance(input: GlanceInput, today: Date = new Date()): Glance {
  const v = { legal_name: input.legalName, compliance: input.coi }
  const bucket = coiBucket(v, today)
  const days = coiDays(v, today)
  const stamps = [
    input.createdAt,
    input.lastReviewedAt,
    ...input.documentDates,
    ...input.bids.map((b) => b.submitted_at),
  ].filter((s): s is string => Boolean(s))
  const last = stamps.reduce<string | null>(
    (acc, s) => (acc === null || Date.parse(s) > Date.parse(acc) ? s : acc),
    null,
  )
  return {
    coiBucket: bucket,
    coiLabel: COI_CHIP[bucket].label,
    coiTone: COI_CHIP[bucket].tone,
    daysToExpiry: days,
    daysLabel: daysLabel(days),
    openBids: input.bids.filter((b) => OPEN_BID.has(b.status)).length,
    openRfps: new Set(
      input.bids.filter((b) => b.rfp_status && OPEN_RFP.has(b.rfp_status)).map((b) => b.rfp_id),
    ).size,
    awardedBids: input.bids.filter((b) => b.status === 'awarded').length,
    lastActivity: last,
  }
}
