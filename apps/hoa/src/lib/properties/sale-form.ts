// The "Record a sale" dialog's form state (P3), as pure functions so the
// share-splitting and the client-side checks are unit-tested and the
// dialog stays a thin view. The server re-validates everything with
// sale-rules.ts validateSale; this only adds what the form itself knows
// (the tenants question must be answered when there are tenants).

import { MAX_BUYERS, validateSale, type RawSale } from './sale-rules'

export interface BuyerDraft {
  key: string
  name: string
  email: string
  phone: string
  mailingAddress: string
  /** Share in percent as typed; ignored with one buyer (100%). */
  pct: string
}

export interface SaleDraft {
  settlementDate: string
  buyers: BuyerDraft[]
  /** null = not answered yet (asked only when the home has tenants). */
  carryTenants: boolean | null
  addBuyersAsResidents: boolean
}

let seq = 0
const blankBuyer = (pct: string): BuyerDraft => ({ key: `b${++seq}`, name: '', email: '', phone: '', mailingAddress: '', pct })

export function emptySaleDraft(today: string, hasTenants: boolean): SaleDraft {
  return { settlementDate: today, buyers: [blankBuyer('100')], carryTenants: hasTenants ? null : false, addBuyersAsResidents: true }
}

/** n shares of 100 to two decimals, adding up to exactly 100 (the last takes the rounding). */
export function evenShares(n: number): string[] {
  if (n <= 0) return []
  const base = Math.floor(10_000 / n) / 100
  const out = Array.from({ length: n }, () => base)
  out[n - 1] = Math.round((100 - base * (n - 1)) * 100) / 100
  return out.map((x) => String(x))
}

/** Another buyer; the shares are re-split evenly (the board edits them after). */
export function addBuyer(d: SaleDraft): SaleDraft {
  if (d.buyers.length >= MAX_BUYERS) return d
  const buyers = [...d.buyers, blankBuyer('')]
  const shares = evenShares(buyers.length)
  return { ...d, buyers: buyers.map((b, i) => ({ ...b, pct: shares[i]! })) }
}

export function removeBuyer(d: SaleDraft, key: string): SaleDraft {
  if (d.buyers.length <= 1) return d
  const buyers = d.buyers.filter((b) => b.key !== key)
  const shares = evenShares(buyers.length)
  return { ...d, buyers: buyers.map((b, i) => ({ ...b, pct: shares[i]! })) }
}

export function updateBuyer(d: SaleDraft, key: string, patch: Partial<Omit<BuyerDraft, 'key'>>): SaleDraft {
  return { ...d, buyers: d.buyers.map((b) => (b.key === key ? { ...b, ...patch } : b)) }
}

/** The shares as typed, added up (for the live "adds up to" line). */
export function sharesTotal(d: SaleDraft): number {
  return Math.round(d.buyers.reduce((t, b) => t + (Number(b.pct) || 0) * 100, 0)) / 100
}

export function draftToRaw(d: SaleDraft): RawSale {
  return {
    settlementDate: d.settlementDate,
    buyers: d.buyers.map((b) => ({ name: b.name, email: b.email, phone: b.phone, mailingAddress: b.mailingAddress, pct: d.buyers.length > 1 ? b.pct : 100 })),
    carryTenants: d.carryTenants === true,
    addBuyersAsResidents: d.addBuyersAsResidents,
  }
}

/**
 * The dialog's own check before sending, keyed like the server's field
 * errors (settlementDate, buyers, buyers.<i>.<field>, carryTenants).
 */
export function checkDraft(d: SaleDraft, today: string): { ok: true; raw: RawSale } | { ok: false; fieldErrors: Record<string, string> } {
  const raw = draftToRaw(d)
  const v = validateSale(raw, today)
  const fieldErrors = v.ok ? {} : { ...v.fieldErrors }
  if (d.carryTenants === null) fieldErrors.carryTenants = 'Choose whether the tenants stay.'
  return Object.keys(fieldErrors).length > 0 ? { ok: false, fieldErrors } : { ok: true, raw }
}
