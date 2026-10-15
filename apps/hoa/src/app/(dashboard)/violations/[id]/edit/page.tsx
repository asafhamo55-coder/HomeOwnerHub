import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LoadFailed, Page } from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import { EditViolationForm } from './EditViolationForm'

export const metadata = { title: 'Edit violation' }

function crumbLabel(text: string): string {
  return text.length > 40 ? `${text.slice(0, 40).trimEnd()}…` : text
}

export default async function EditViolationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await getSupabaseServerClient()

  const result = await loadOrFail(
    'this violation',
    supabase
      .from('hoa_violations')
      .select('id, description, violation_type, ccr_section, severity, cure_period_days, fine_amount')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
  )

  if (!result.ok) {
    return (
      <Page
        width="narrow"
        title="Edit violation"
        breadcrumbs={[{ label: 'Violations', href: '/violations' }, { label: 'Edit' }]}
        linkAs={Link}
      >
        <LoadFailed what="this violation" retryHref={`/violations/${id}/edit`} />
      </Page>
    )
  }
  if (!result.data) notFound()
  const v = result.data as {
    id: string
    description: string
    violation_type: string
    ccr_section: string | null
    severity: string | null
    cure_period_days: number | null
    fine_amount: number | null
  }

  return (
    <Page
      width="narrow"
      title="Edit violation"
      description="Changes apply to the record only. Notices already sent are not re-sent."
      breadcrumbs={[
        { label: 'Violations', href: '/violations' },
        { label: crumbLabel(v.description), href: `/violations/${v.id}` },
        { label: 'Edit' },
      ]}
      linkAs={Link}
    >
      <EditViolationForm
        violationId={v.id}
        defaultValues={{
          description: v.description,
          violationType: v.violation_type,
          ccrSection: v.ccr_section ?? '',
          severity: (v.severity as 'low' | 'medium' | 'high') ?? 'low',
          curePeriodDays: v.cure_period_days ?? 14,
          fineAmount: v.fine_amount ?? 0,
        }}
      />
    </Page>
  )
}
