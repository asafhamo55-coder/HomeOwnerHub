import Link from 'next/link'
import { asUnitId } from '@/lib/properties/resolve'
import { propertyHref } from '@/lib/properties/href'
import { usd } from '@/lib/money/format'

/**
 * "Credit $X" for a home with unapplied credit. The text carries the meaning
 * (not color alone); it links to the home's page, where "Apply credit" lives.
 * Renders nothing at zero.
 */
export function CreditBadge({ unitId, amount }: { unitId: string; amount: number }) {
  if (!(amount > 0)) return null
  return (
    <Link
      href={propertyHref(asUnitId(unitId))}
      aria-label={`Unapplied credit ${usd(amount)}. Open this home to apply it.`}
      className="mt-1 inline-block rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-medium text-foreground no-underline hover:underline"
    >
      Credit {usd(amount)}
    </Link>
  )
}
