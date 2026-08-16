import Link from 'next/link'
import { ChevronLeft, MessageSquare } from 'lucide-react'
import { Card, EmptyState } from '@homeowner-portal/ui'
import { createAdminClient } from '@homeowner-portal/db'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'
import { listTemplates } from '@/lib/communications/queries'
import { countAudiences } from '@/lib/communications/audience'
import type { TemplateQuestion } from '@/lib/community-templates/types'
import { NewCommunicationWizard } from './NewCommunicationWizard'

export const metadata = { title: 'New message' }

/**
 * The `questions` column is jsonb, so Supabase types it as bare `Json`.
 * Seeded/authored rows always hold a TemplateQuestion[] shape (enforced by
 * the community-templates registry validator at authoring time), but the
 * column type itself doesn't know that — narrow to "is it an array" at
 * runtime before trusting the element shape, rather than casting blindly.
 */
function toTemplateQuestions(questions: unknown): readonly TemplateQuestion[] {
  return Array.isArray(questions) ? (questions as unknown as TemplateQuestion[]) : []
}

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

  // Property list for the "Specific property" audience option. Cheap
  // top-level query — we don't load residents here; that's lazy-loaded
  // per-property via the listPropertyResidents server action.
  const { data: propertyRows } = await supabase
    .from('hoa_properties')
    .select('id, address, unit_number')
    .eq('org_id', assocRow.organization_id)
    .is('deleted_at', null)
    .order('address')
    .limit(500)
  const properties = (propertyRows ?? []).map((p) => ({
    id: p.id as string,
    label: [p.address, p.unit_number ? `· ${p.unit_number}` : null]
      .filter(Boolean)
      .join(' '),
  }))

  // Pre-compute audience counts so the wizard can show "All owners (82)"
  // without a roundtrip per selection.
  //
  // These used to be independent `count: 'exact'` queries written here, and
  // they counted different things than resolveAudience sends to:
  // late_on_dues counted assessment ROWS against a resolver that sends to
  // distinct UNITS (Madison Park: 24 overdue assessments across 5 units, so
  // the chip read 24 and the send went to 5), and owners_only/tenants_only
  // counted ownership/tenancy rows against a resolver that emits one
  // recipient per unit. countAudiences lives next to resolveAudience so the
  // two cannot drift again.
  const audienceCounts = await countAudiences(supabase, assoc.id)

  // Board headcount is org-scoped rather than association-scoped, and needs
  // the service-role client to see past org_members RLS, so it stays here.
  const { count: boardCount } = await createAdminClient()
    .from('org_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('org_id', assocRow.organization_id)
    .eq('role', 'board')

  const counts = {
    ...audienceCounts,
    board: boardCount ?? 0,
  }

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
              questions: toTemplateQuestions(t.questions),
              // Drives the per-section toggles: the composer looks the
              // template up in the community registry by this slug.
              topicSlug: t.topic_slug ?? null,
            }))}
            audienceCounts={counts}
            properties={properties}
          />
        </div>
      </Card>
    </div>
  )
}
