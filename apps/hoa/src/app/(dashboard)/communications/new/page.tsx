import Link from 'next/link'
import { MessageSquare } from 'lucide-react'
import { Alert, Button, Card, EmptyState, LoadFailed, Page } from '@homeowner-portal/ui'
import { createAdminClient } from '@homeowner-portal/db'
import { M1_APPLIED } from '@homeowner-portal/db/m1'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'
import { getCommunication, listTemplates } from '@/lib/communications/queries'
import { loadDraft } from '@/lib/communications/draft-actions'
import { buildFollowUpDraft, parseFollowUpVia, type FollowUpDraft } from '@/lib/communications/follow-up'
import { countAudiences } from '@/lib/communications/audience'
import { loadStreetOptions } from '@/lib/communications/streets'
import { officialNoticeApplies } from '@/lib/communications/official-notice'
import { loadOrFail } from '@/lib/load-or-fail'
import { parsePropertyParam } from '@/lib/property-scope'
import type { TemplateQuestion } from '@/lib/community-templates/types'
import { BUDGET_NOTICE_FROM } from '@/lib/budget-notice/draft-handoff'
import { HEARING_NOTICE_FROM } from '@/lib/violation-hearings/notice-handoff'
import { RATE_NOTICE_FROM } from '@/lib/dues-rates/notice'
import { HO6_NOTICE_FROM } from '@/lib/insurance/ho6-notice'
import { smsConfigured } from '@/lib/sms'
import { parseMeetingParam } from '@/lib/meetings/notice-prefill'
import { loadMeetingNoticeContext, type MeetingNoticeContext } from '@/lib/meetings/notice-queries'
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

const BREADCRUMBS = [{ label: 'Messages', href: '/communications' }, { label: 'New message' }]

export default async function NewCommunicationPage({
  searchParams,
}: {
  /**
   * `?property=<id>`: opened from a property page's "Message owner".
   * `?from=budget-notice`: opened from the owner budget notice (BL-091).
   * `?followUp=<id>&via=email|text`: from a results page (BL-102 A8).
   * `?draft=<id>`: resume an autosaved draft (BL-102 A9). Wins over the
   * others, since the draft already holds what they pre-filled.
   * `?meeting=<id>`: a meeting notice to all owners (BL-118).
   * `?from=hearing-notice&property=<id>`: a violation hearing notice to one
   * home (BL-133), handed over in this tab's sessionStorage.
   * `?from=dues-rate-notice`: the owner notice for a dues change (BL-137).
   * `?from=ho6-notice`: the optional HO-6 notice to owners (BL-142).
   */
  searchParams: Promise<{ property?: string; from?: string; followUp?: string; via?: string; draft?: string; meeting?: string }>
}) {
  const sp = await searchParams
  const resumeDraft = sp.draft ? await loadDraft(sp.draft) : null
  const draftMissing = Boolean(sp.draft) && resumeDraft === null
  const initialPropertyId = resumeDraft ? null : parsePropertyParam(sp.property)
  const prefillFrom =
    resumeDraft ? null : sp.from === BUDGET_NOTICE_FROM ? BUDGET_NOTICE_FROM : sp.from === HEARING_NOTICE_FROM ? HEARING_NOTICE_FROM : sp.from === RATE_NOTICE_FROM ? RATE_NOTICE_FROM : sp.from === HO6_NOTICE_FROM ? HO6_NOTICE_FROM : null
  // BL-118: prefill a meeting notice. A resumed draft or another prefill wins.
  const meetingParam = !resumeDraft && !prefillFrom && !sp.followUp ? parseMeetingParam(sp.meeting) : null
  const meetingCtx: MeetingNoticeContext | null = meetingParam ? await loadMeetingNoticeContext(meetingParam) : null
  const assoc = await getPrimaryAssociation()
  if (!assoc) {
    return (
      <Page width="narrow" title="New message" breadcrumbs={BREADCRUMBS} linkAs={Link}>
        <EmptyState
          icon={<MessageSquare aria-hidden />}
          title="No HOA association configured"
          description="Set up an association before sending communications."
          action={
            <Button asChild>
              <Link href="/settings">Open settings</Link>
            </Button>
          }
        />
      </Page>
    )
  }

  const supabase = await getSupabaseServerClient()
  const assocRes = await loadOrFail(
    'association',
    supabase.from('associations').select('organization_id').eq('id', assoc.id).single(),
  )
  if (!assocRes.ok || !assocRes.data) {
    return (
      <Page width="narrow" title="New message" breadcrumbs={BREADCRUMBS} linkAs={Link}>
        <LoadFailed what="your association record" />
      </Page>
    )
  }
  const orgId = (assocRes.data as { organization_id: string }).organization_id

  // Property list for the "Specific property" audience option. Cheap
  // top-level query — residents are lazy-loaded per property via the
  // listPropertyResidents server action. No hard cap: a silent cap hid the
  // 501st property from the picker. The count makes any server-side row
  // limit visible instead.
  const [templates, propertyRes, audienceCounts, boardRes, streets] = await Promise.all([
    listTemplates(orgId, assoc.id),
    loadOrFail(
      'properties',
      supabase
        .from('hoa_properties')
        .select('id, address, unit_number', { count: 'exact' })
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .order('address'),
    ),
    // Pre-compute audience counts so the wizard can show "All owners (82)"
    // without a roundtrip per selection. countAudiences lives next to
    // resolveAudience so the counts and the send cannot drift.
    countAudiences(supabase, assoc.id),
    // Board headcount is org-scoped rather than association-scoped, and
    // needs the service-role client to see past org_members RLS.
    loadOrFail(
      'board member count',
      createAdminClient()
        .from('org_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('role', 'board'),
    ),
    // BL-102 A5: "A street" audience, parsed from the homes' addresses.
    loadStreetOptions(supabase, assoc.id),
  ])

  if (!propertyRes.ok || !boardRes.ok) {
    return (
      <Page width="narrow" title="New message" breadcrumbs={BREADCRUMBS} linkAs={Link}>
        <LoadFailed
          what={!propertyRes.ok ? 'your properties' : 'the board roster'}
          hint="The audience counts depend on it, so the composer is not shown."
        />
      </Page>
    )
  }

  const propertyRows = propertyRes.data ?? []
  const properties = propertyRows.map((p) => ({
    id: p.id as string,
    label: [p.address, p.unit_number ? `· ${p.unit_number}` : null].filter(Boolean).join(' '),
  }))
  const propertyTotal = propertyRes.count ?? properties.length

  // BL-020: the official-notice box only where it changes the send (a CA
  // association, M1 applied). With the flag off there is no extra query.
  let officialNoticeOffered = false
  if (M1_APPLIED) {
    const stateRes = await loadOrFail(
      'association state',
      supabase.from('associations').select('state').eq('id', assoc.id).single(),
    )
    if (!stateRes.ok || !stateRes.data) {
      // Hiding the box on a failed read would let a CA official notice go
      // out unfiltered — refuse to show the composer instead.
      return (
        <Page width="narrow" title="New message" breadcrumbs={BREADCRUMBS} linkAs={Link}>
          <LoadFailed what="your association record" />
        </Page>
      )
    }
    officialNoticeOffered = officialNoticeApplies((stateRes.data as { state: string | null }).state, true)
  }

  // BL-102 A8: a follow-up to the homes that haven't opened. Only fills
  // the composer; the board reviews and sends.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const via = parseFollowUpVia(sp.via)
  let followUp: FollowUpDraft | null = null
  let followUpUnavailable = false
  if (!resumeDraft && sp.followUp && UUID_RE.test(sp.followUp) && via) {
    const original = await getCommunication(assoc.id, sp.followUp)
    followUp =
      original && (via === 'email' || smsConfigured())
        ? buildFollowUpDraft(original, { associationName: assoc.name, via })
        : null
    followUpUnavailable = followUp === null
  }

  const counts = {
    ...audienceCounts,
    board: boardRes.count ?? 0,
  }

  return (
    <Page
      width="narrow"
      linkAs={Link}
      breadcrumbs={BREADCRUMBS}
      title="New message"
      description="Pick a template or write your own, choose who gets it, review, send. Every message and its delivery history are kept under Messages, on Sent to residents."
    >
      {meetingCtx && !meetingCtx.ok ? (
        <Alert variant="warning" title="No meeting notice to prefill">
          {meetingCtx.reason === 'held'
            ? 'That meeting has already taken place. You can still write a message below.'
            : meetingCtx.reason === 'failed'
              ? 'The meeting couldn’t be loaded. Go back to the meeting and try again.'
              : 'That meeting isn’t here any more. You can still write a message below.'}
        </Alert>
      ) : null}
      {draftMissing ? (
        <Alert variant="warning" title="That draft isn’t here any more">
          It was sent or deleted. You can start a new message below.
        </Alert>
      ) : null}
      {followUpUnavailable ? (
        <Alert variant="warning" title="No follow-up to send">
          That message has no homes left to follow up, or its audience can’t be followed up this way. You can
          still write a new message below.
        </Alert>
      ) : null}
      {propertyTotal > properties.length ? (
        <Alert variant="warning" title="Not every property is in the picker">
          The “One home” list shows {properties.length} of {propertyTotal} properties. Other
          audiences are unaffected.
        </Alert>
      ) : null}
      <Card className="overflow-hidden">
        <NewCommunicationWizard
          // A fresh composer per visit: client state must not carry over
          // from a draft (or another message) the board just left.
          key={resumeDraft?.id ?? `new-${Date.now()}`}
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
          initialPropertyId={initialPropertyId}
          officialNoticeOffered={officialNoticeOffered}
          prefillFrom={prefillFrom}
          // Env names only; never sent to the browser as values.
          smsConfigured={smsConfigured()}
          streets={streets}
          followUp={followUp}
          resumeDraft={resumeDraft}
          meetingNotice={meetingCtx?.ok ? { prefill: meetingCtx.prefill, check: meetingCtx.check } : null}
        />
      </Card>
    </Page>
  )
}
