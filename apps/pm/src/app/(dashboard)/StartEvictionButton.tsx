'use client'

import { Gavel } from 'lucide-react'
import { Button } from '@homeownerhub/ui'

interface StartEvictionButtonProps {
  address: string
  monthlyRent: number
  tenantName: string | null
  daysUnpaid: number
}

// Cross-hub handoff: builds the Eviction Hub /cases/new URL with the
// landlord's data pre-filled, then opens it in a new tab. The eviction
// wizard's NewCase page reads these params and seeds the Wizard's
// initial state, so the landlord doesn't re-type anything.
export function StartEvictionButton({
  address,
  monthlyRent,
  tenantName,
  daysUnpaid,
}: StartEvictionButtonProps) {
  function handleClick() {
    const base =
      process.env.NEXT_PUBLIC_EVICTION_URL ?? 'http://localhost:3001'
    const params = new URLSearchParams({
      address,
      rent: String(monthlyRent),
      tenant: tenantName ?? '',
      days_unpaid: String(daysUnpaid),
      from: 'pm-hub',
    })
    window.open(`${base}/cases/new?${params.toString()}`, '_blank', 'noopener')
  }

  return (
    <Button size="lg" variant="destructive" onClick={handleClick}>
      <Gavel className="h-4 w-4" />
      Start eviction
    </Button>
  )
}
