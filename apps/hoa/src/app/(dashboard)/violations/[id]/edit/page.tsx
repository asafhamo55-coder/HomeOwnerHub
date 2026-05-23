import { notFound } from 'next/navigation'
import { BackLink, PageHeader } from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { EditViolationForm } from './EditViolationForm'

export default async function EditViolationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await getSupabaseServerClient()

  const { data } = await supabase
    .from('hoa_violations')
    .select(
      'id, description, violation_type, ccr_section, severity, cure_period_days, fine_amount',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!data) notFound()
  const v = data as {
    id: string
    description: string
    violation_type: string
    ccr_section: string | null
    severity: string | null
    cure_period_days: number | null
    fine_amount: number | null
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackLink href={`/violations/${id}`} label="Back to violation" />
      <PageHeader title="Edit violation" />
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
    </div>
  )
}
