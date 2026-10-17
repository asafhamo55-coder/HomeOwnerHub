import Link from 'next/link'
import { LoadFailed, Page } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { PropertyForm, type AssociationChoice } from './PropertyForm'

export const metadata = { title: 'Add property' }

export default async function NewPropertyPage() {
  // A new property also gets its unit record, which belongs to one
  // community. Only an org with several asks the board to pick.
  const org = await getCurrentOrg()
  let associations: AssociationChoice[] = []
  let loadFailed = false
  if (org) {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from('associations')
      .select('id, name')
      .eq('organization_id', org.id)
      .order('name', { ascending: true })
    if (error) {
      // Without the list an org with several communities could not pick
      // one, and the save would be refused. Say so instead.
      console.error('NewPropertyPage: associations read failed', { code: error.code })
      loadFailed = true
    }
    associations = (data ?? []) as AssociationChoice[]
  }

  return (
    <Page
      width="narrow"
      title="Add a property"
      description="Only the address is required. Residents, tenure and dues can be added from the property afterwards."
      breadcrumbs={[{ label: 'Properties', href: '/properties' }, { label: 'Add property' }]}
      linkAs={Link}
    >
      {loadFailed ? (
        <LoadFailed what="your communities" />
      ) : (
        <PropertyForm associations={associations.length > 1 ? associations : []} />
      )}
    </Page>
  )
}
