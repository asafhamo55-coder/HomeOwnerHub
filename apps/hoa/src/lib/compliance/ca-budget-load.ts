import 'server-only'

// BL-145: California's § 5300(a) annual budget report status for
// /compliance and the board packet, taken from the BL-138 adoption
// checklist of the soonest budget in budget season — the same reads and
// the same "sent" rule the budget page uses, so the two never disagree.
// The caller has already checked the board/admin role; the cookie-bound
// client keeps RLS on top. Ids and codes only in logs (inside the loaders).

import { periodLabel } from '@/lib/money/format'
import { listSeasonBudgets, loadAdoptionKit, type LooseDb } from '@/lib/budget-adoption/load'
import type { ComplianceAssociationInput } from './deadlines'
import type { CaBudgetInput } from './obligations'

export function caBudgetLoader(db: LooseDb, orgId: string, today: string, timeZone: string) {
  return async (associations: ComplianceAssociationInput[]): Promise<Map<string, CaBudgetInput>> => {
    const out = new Map<string, CaBudgetInput>()
    await Promise.all(
      associations.map(async (a) => {
        const budgets = await listSeasonBudgets(db, a.id, today, periodLabel)
        if (!budgets) return void out.set(a.id, { kind: 'failed' })
        const b = budgets[0]
        if (!b) return void out.set(a.id, { kind: 'none' })
        const loaded = await loadAdoptionKit(db, {
          orgId,
          association: { id: a.id, state: a.state, governing_law_state: a.governingLawState, compliance_settings: a.complianceSettings },
          timeZone,
          today,
          budget: b,
        })
        const w = loaded?.kit.caWindow
        if (!loaded || !w) return void out.set(a.id, { kind: loaded ? 'none' : 'failed' })
        const sent = loaded.kit.steps.some((s) => s.id === 'owner_notice' && s.state === 'done')
        out.set(a.id, { kind: 'ok', budgetId: b.id, earliest: w.earliest, latest: w.latest, sent })
      }),
    )
    return out
  }
}
