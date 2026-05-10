import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
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
  const { data } = await supabase
    .from('pm_properties')
    .select(
      'id, address, monthly_rent, tenant_name, tenant_email, tenant_phone, lease_start, lease_end',
    )
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const existing = (data ?? null) as ExistingProperty | null

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-muted">
          {existing ? 'Edit property' : 'Add your property'}
        </h1>
        <p className="text-sm text-muted-fg">
          PM Hub on the free plan tracks one property. Upgrade for unlimited.
        </p>
      </header>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>{existing ? existing.address : 'Property details'}</CardTitle>
          <CardDescription>
            We&apos;ll auto-create monthly rent rows from this lease so you can mark them paid.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PropertyForm existing={existing} />
        </CardContent>
      </Card>
    </div>
  )
}
