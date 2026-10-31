/**
 * Pure copy and state for the "Generate dues" dialog preview. Display
 * only: nothing here decides an amount or what gets billed.
 */
import { formatDay, plural, usd } from '@/lib/money/format'

export const PREVIEW_FAILED = 'Couldn’t preview this run'
export const NO_RATE_HINT = 'Set your dues rate in Settings, or enter an amount'

/** The amount field starts at the dues rate in effect, else blank. Never a made-up default. */
export function initialAmount(prefill: { cents: number } | null): string {
  return prefill ? (prefill.cents / 100).toFixed(2) : ''
}

export interface PreviewFacts {
  toBill: number
  alreadyBilled: number
  rateCents: number | null
  totalCents: number | null
  dueDate: string
}

/** "12 homes, $250.00 each, $3,000.00 total, due Nov 15, 2026." */
export function previewLine(p: PreviewFacts, typedAmount: number | null): string {
  const homes = plural(p.toBill, 'home')
  const each = typedAmount ?? (p.rateCents === null ? null : p.rateCents / 100)
  const due = `due ${formatDay(p.dueDate)}`
  if (each === null) return `${homes}, ${due}.`
  return `${homes}, ${usd(each)} each, ${usd(each * p.toBill)} total, ${due}.`
}

export function skippedLine(alreadyBilled: number): string | null {
  return alreadyBilled > 0 ? `${alreadyBilled} already billed for this month will be skipped.` : null
}

export function emptyReason(p: PreviewFacts): string | null {
  if (p.toBill > 0) return null
  return p.alreadyBilled > 0
    ? 'Every home is already billed for this month, so there is nothing to generate.'
    : 'There are no homes to bill yet. Add properties first.'
}

export function billedToast(created: number | undefined, monthLabel: string): string {
  const n = created ?? 0
  return `Billed ${plural(n, 'home')} for ${monthLabel}`
}
