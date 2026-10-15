import { Card, CardContent, CardDescription, CardHeader, CardTitle, LoadFailed, Page } from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import { PropertyForm } from './PropertyForm'

export const metadata = { title: 'Property' }

interface ExistingProperty {
  id: string
  address: string
  monthly_rent: number | null
  tenant_name: string | null
  tenant_email: string | null
  tenant_phone: string | null
  lease_start: string | null
  lease_end: string | null
}

export default async function PropertySetupPage() {
  const supabase = await getSupabaseServerClient()
  // One property per workspace on the free plan — the first one added.
  const res = await loadOrFail(
    'your property',
    supabase
      .from('pm_properties')
      .select('id, address, monthly_rent, tenant_name, tenant_email, tenant_phone, lease_start, lease_end')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  )

  if (!res.ok) {
    return (
      <Page width="narrow" title="Property" back={{ href: '/', label: 'Dashboard' }}>
        <LoadFailed what="your property" hint="Saving now could create a duplicate, so the form is hidden until it loads." />
      </Page>
    )
  }

  const existing = (res.data ?? null) as ExistingProperty | null

  return (
    <Page
      width="narrow"
      back={{ href: '/', label: 'Dashboard' }}
      title={existing ? 'Edit property' : 'Add your property'}
      description="The free plan tracks one property. Upgrade for unlimited."
    >
      <Card>
        <CardHeader>
          <CardTitle as="h2">{existing ? existing.address : 'Property details'}</CardTitle>
          <CardDescription>We create a rent row for each month of this lease so you can mark it paid.</CardDescription>
        </CardHeader>
        <CardContent>
          <PropertyForm existing={existing} />
        </CardContent>
      </Card>
    </Page>
  )
}
