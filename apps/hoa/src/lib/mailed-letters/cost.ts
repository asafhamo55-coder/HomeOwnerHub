/**
 * BL-032: what one mailed letter costs, in integer cents. Pure.
 *
 * The prices are NOT hard-coded to a vendor. The owner sets them (from the
 * chosen provider's own pricing page) in MailPricing; until then the send
 * action has no pricing and refuses. The board always sees the total before
 * confirming, and the confirmation must equal the figure the server
 * recomputes (send.ts).
 */

import type { MailService } from './provider'

export interface MailPricing {
  /** First page, black and white, first class. */
  baseCents: number
  /** Added for color printing. */
  colorCents: number
  /** Each page after the first. */
  extraPageCents: number
  /** Certified mail add-on. */
  certifiedCents: number
  /** Certified mail with an electronic return receipt, replaces certifiedCents. */
  certifiedReturnReceiptCents: number
}

export interface CostInput {
  pages: number
  color: boolean
  service: MailService
}

export interface CostLine {
  label: string
  cents: number
}

export function costLines(p: MailPricing, i: CostInput): CostLine[] {
  const lines: CostLine[] = [{ label: 'Printing and first-class postage', cents: p.baseCents }]
  if (i.color) lines.push({ label: 'Color printing', cents: p.colorCents })
  if (i.pages > 1) lines.push({ label: `${i.pages - 1} extra page${i.pages - 1 === 1 ? '' : 's'}`, cents: p.extraPageCents * (i.pages - 1) })
  if (i.service === 'certified') lines.push({ label: 'Certified mail', cents: p.certifiedCents })
  if (i.service === 'certified_return_receipt') lines.push({ label: 'Certified mail with return receipt', cents: p.certifiedReturnReceiptCents })
  return lines
}

export function letterCostCents(p: MailPricing, i: CostInput): number {
  return costLines(p, i).reduce((sum, l) => sum + l.cents, 0)
}

/** "$1.06" from integer cents, for the confirmation screen. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}
