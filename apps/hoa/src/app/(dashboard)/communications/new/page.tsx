import Link from 'next/link'
import { ChevronLeft, MessageSquare } from 'lucide-react'
import { Card, EmptyState } from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'
import { listTemplates } from '@/lib/communications/queries'
import { NewCommunicationWizard } from './NewCommunicationWizard'

export const metadata = { title: 'New message' }

export default async function NewCommunicationPage() {
  const assoc = await getPrimaryAssociation()
  if (!assoc) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<MessageSquare className="h-10 w-10" aria-hidden />}
          title="No HOA association configured"
          description="Set up an association before sending communications."
        />
      </div>
    )
  }

  const supabase = await getSupabaseServerClient()
  const { data: assocRow } = await supabase
    .from('associations')
    .select('organization_id')
    .eq('id', assoc.id)
    .single()
  if (!assocRow) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<MessageSquare className="h-10 w-10" aria-hidden />}
          title="Association not found"
          description="We couldn't load your association record."
        />
      </div>
    )
  }

  const templates = await listTemplates(assocRow.organization_id, assoc.id)

  // Pre-compute audience counts so the wizard can show "All owners (82)"
  // without a roundtrip per selection. Cheap counts via Postgres.
  const today = new Date().toISOString().slice(0, 10)
  const [unitsCount, ownersCount, tenantsCount, lateCount] = await Promise.all([
    supabase
      .from('units')
      .select('id', { count: 'exact', head: true })
      .eq('association_id', assoc.id),
    supabase
      .from('ownerships')
      .select('id', { count: 'exact', head: true })
      .is('valid_to', null)
      .in(
        'unit_id',
        (
          await supabase
            .from('units')
            .select('id')
            .eq('association_id', assoc.id)
        ).data?.map((u) => u.id) ?? [],
      ),
    supabase
      .from('tenancies')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .in(
        'unit_id',
        (
          await supabase
            .from('units')
            .select('id')
            .eq('association_id', assoc.id)
        ).data?.map((u) => u.id) ?? [],
      ),
    supabase
      .from('assessments')
      .select('id', { count: 'exact', head: true })
      .eq('association_id', assoc.id)
      .in('status', ['open', 'partial'])
      .lt('due_date', today),
  ])

  const audienceCounts = {
    everyone: unitsCount.count ?? 0,
    owners_only: ownersCount.count ?? 0,
    tenants_only: tenantsCount.count ?? 0,
    late_on_dues: lateCount.count ?? 0,
  }

  // Open-violations count requires the same legacy_hoa_property_id join
  // the audience resolver does. Cheap — keep it inline rather than
  // duplicating into the wizard.
  const { data: legacyUnits } = await supabase
    .from('units')
    .select('legacy_hoa_property_id')
    .eq('association_id', assoc.id)
    .not('legacy_hoa_property_id', 'is', null)
  const legacyIds = (legacyUnits ?? [])
    .map((u) => u.legacy_hoa_property_id)
    .filter((id): id is string => !!id)
  let openViolationsCount = 0
  if (legacyIds.length > 0) {
    const { data: vios } = await supabase
      .from('hoa_violations')
      .select('property_id')
      .in('property_id', legacyIds)
      .in('status', ['open', 'notice_sent'])
    openViolationsCount = new Set((vios ?? []).map((v) => v.property_id)).size
  }
  const counts = { ...audienceCounts, open_violations: openViolationsCount }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/communications"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Communications
        </Link>
        <h1 className="text-2xl font-bold text-foreground">New message</h1>
        <p className="text-sm text-muted">
          Pick a topic, pick an audience, pick a template, preview, send.
          Every step is auditable.
        </p>
      </header>

      <Card>
        <div className="p-6">
          <NewCommunicationWizard
            templates={templates.map((t) => ({
              id: t.id,
              category: t.category,
              name: t.name,
              description: t.description ?? '',
              subject: t.subject,
              bodyHtml: t.body_html,
              bodyText: t.body_text ?? '',
              channels: t.channels,
            }))}
            audienceCounts={counts}
          />
        </div>
      </Card>
    </div>
  )
}
