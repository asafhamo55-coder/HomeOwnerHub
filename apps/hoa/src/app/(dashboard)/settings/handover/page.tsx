import Link from 'next/link'
import { Page } from '@homeowner-portal/ui'
import { createAdminClient } from '@homeowner-portal/db'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadHandover } from '@/lib/handover/load'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { HandoverKit } from './HandoverKit'

export const metadata = { title: 'Board handover' }
export const dynamic = 'force-dynamic'

// BL-117 Board turnover kit. Board or admin, like Members and Your data:
// a handover is usually run by the outgoing treasurer or president, who is
// often a board member rather than the org admin. The gate runs before any
// read; residents are redirected by requireBoardOrAdmin.
export default async function HandoverSettingsPage() {
  const { role, org } = await requireBoardOrAdmin()

  const model = await loadHandover({
    db: await getSupabaseServerClient(),
    admin: createAdminClient(),
    orgId: org.id,
    orgName: org.name,
  })

  return (
    <Page
      width="narrow"
      title="Board handover"
      description="When board members change: who has access, what is tied to one person’s login, what they still own, and a copy of the records."
      tabs={<SettingsTabs current="/settings/handover" role={role} />}
      linkAs={Link}
    >
      <HandoverKit model={model} viewerRole={role} />
    </Page>
  )
}
