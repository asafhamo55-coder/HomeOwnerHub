import type { KpiDelta } from '@homeowner-portal/ui'

/**
 * Turn a value and its 30-days-ago comparison into the Kpi tile's delta.
 * The sign and arrow carry direction; `sentiment` only picks the colour,
 * so the delta never relies on colour alone. Null when there is no
 * comparable baseline.
 */
export function kpiDelta(value: number, previous: number | null, upIsBad: boolean): KpiDelta | undefined {
  if (previous == null) return undefined
  if (previous === value) {
    return { value: 'No change', direction: 'flat', sentiment: 'neutral', label: 'vs 30 days ago' }
  }
  const diff = value - previous
  const up = diff > 0
  const pct = previous === 0 ? null : Math.round((diff / previous) * 100)
  const magnitude = pct != null ? `${Math.abs(pct)}%` : Math.abs(diff).toLocaleString('en-US')
  const good = upIsBad ? !up : up
  return {
    value: `${up ? '+' : '−'}${magnitude}`,
    direction: up ? 'up' : 'down',
    sentiment: good ? 'positive' : 'negative',
    label: 'vs 30 days ago',
  }
}
