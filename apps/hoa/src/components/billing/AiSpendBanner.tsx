import { Alert } from '@homeowner-portal/ui'
import { PRICING_V2 } from '@homeowner-portal/billing'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { aiSpendLevel, aiSpendThresholdsUsd } from '@/lib/api/ai-limits'
import { aiSpendBannerCopy, readMonthlyAiSpend } from '@/lib/api/ai-spend'
import { loadAiBudget } from '@/lib/api/rate-limit'

/**
 * BL-108: the board's banner while the org's monthly AI spend ceiling has
 * paused AI (tier 1 at 25% of the plan price, tier 2 at 30%; trials $5).
 * Before PRICING_V2 it returns nothing without a read; legacy and pre-flip
 * orgs have no budget and never see it. Read with the viewer's own client
 * (the dashboard is board/admin only). Advisory: a failed read renders
 * nothing.
 */
export async function AiSpendBanner({ orgId, className }: { orgId: string; className?: string }) {
  if (!PRICING_V2) return null
  try {
    const supabase = await getSupabaseServerClient()
    const budget = await loadAiBudget(supabase, orgId)
    if (!budget) return null
    const now = Date.now()
    const reading = await readMonthlyAiSpend(supabase, orgId, now)
    const copy = aiSpendBannerCopy(aiSpendLevel(reading.spendUsd, aiSpendThresholdsUsd(budget)), now)
    if (!copy) return null
    return (
      <Alert variant="warning" title={copy.title} className={className}>
        {copy.body}
      </Alert>
    )
  } catch {
    return null
  }
}
