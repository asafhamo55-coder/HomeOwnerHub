import Link from 'next/link'
import { Alert, LoadFailed, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getBoardPublicSite } from '@/lib/public-site/actions'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { AssociationNotSetUp } from '../../_components/AssociationNotSetUp'
import { PublicSiteBuilder } from './PublicSiteBuilder'

export const metadata = { title: 'Public page' }
export const dynamic = 'force-dynamic'

export default async function PublicSiteSettingsPage() {
  const { role } = await requireBoardOrAdmin()
  const load = await getBoardPublicSite()

  const page = (body: React.ReactNode) => (
    <Page
      width="narrow"
      title="Public page"
      description="A simple page anyone can open without signing in. Nothing is shown until you add it and turn the page on."
      tabs={<SettingsTabs current="/settings/public-site" role={role} />}
      linkAs={Link}
    >
      {body}
    </Page>
  )

  if (!load.ok) {
    if (load.reason === 'no_association') {
      return page(
        <AssociationNotSetUp needFor="The public page belongs to your association." returnTo="/settings/public-site" />,
      )
    }
    if (load.reason === 'not_ready') {
      return page(<Alert variant="info" title="Not ready yet">The public page isn’t available yet. We’ll turn it on soon.</Alert>)
    }
    return page(<LoadFailed what="the public page settings" />)
  }

  return page(<PublicSiteBuilder data={load.data} />)
}
