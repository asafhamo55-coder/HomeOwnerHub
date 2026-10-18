import Link from 'next/link'
import { Alert, LoadFailed, NoOrgSelected, Page } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getCurrentUserRole } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { RosterImport } from './RosterImport'
import type { AssociationChoice } from './RosterImportSteps'

export const metadata = { title: 'Import properties' }
export const dynamic = 'force-dynamic'
// Each Import chunk is a server action on this page; give a slow chunk room.
export const maxDuration = 60

export default async function ImportPropertiesPage() {
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected />

  const page = (body: React.ReactNode) => (
    <Page
      width="default"
      title="Import properties"
      description="Bring in every home and owner from a spreadsheet, such as a CINC Systems export. You see what will happen to each row before anything is saved."
      breadcrumbs={[{ label: 'Properties', href: '/properties' }, { label: 'Import' }]}
      linkAs={Link}
    >
      {body}
    </Page>
  )

  // The actions gate on this too; this just says so up front.
  const ctx = await getCurrentUserRole()
  if (ctx?.role !== 'admin' && ctx?.role !== 'board') {
    return page(
      <Alert variant="warning" title="Board members and admins only">
        Ask a board member or admin to import the roster.
      </Alert>,
    )
  }

  // A home belongs to one community. Only an org with several asks.
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('associations')
    .select('id, name')
    .eq('organization_id', org.id)
    .order('name', { ascending: true })
  if (error) {
    console.error('ImportPropertiesPage: associations read failed', { code: error.code })
    return page(<LoadFailed what="your communities" />)
  }
  const associations = (data ?? []) as AssociationChoice[]

  return page(<RosterImport associations={associations.length > 1 ? associations : []} />)
}
