import type { Database } from '@homeowner-portal/db/types'
import { getSupabaseServerClient } from '@/lib/supabase/server'

type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type Communication = Row<'communications'>
export type CommunicationTemplate = Row<'communication_templates'>
export type CommunicationRecipient = Row<'communication_recipients'>

export interface CommunicationSummary {
  id: string
  category: string
  subject: string
  status: string
  channels: string[]
  audience_summary: string | null
  scheduled_for: string | null
  sent_at: string | null
  created_at: string
  /** Aggregate counts over communication_recipients for this comm. */
  totalRecipients: number
  sentCount: number
  openedCount: number
  repliedCount: number
  failedCount: number
}

export interface ListCommunicationsFilters {
  category?: string
  status?: string
  limit?: number
}

/**
 * Activity-feed query. Aggregates per-recipient delivery state into a
 * single row per communication. One round-trip via PostgREST nested
 * select — Supabase returns the children inline so we count in memory.
 */
export async function listCommunications(
  associationId: string,
  filters: ListCommunicationsFilters = {},
): Promise<CommunicationSummary[]> {
  const supabase = await getSupabaseServerClient()
  let q = supabase
    .from('communications')
    .select(
      'id, category, subject, status, channels, audience_summary, scheduled_for, sent_at, created_at, ' +
        'recipients:communication_recipients(delivery_status)',
    )
    .eq('association_id', associationId)
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 100)

  if (filters.category) q = q.eq('category', filters.category)
  if (filters.status) q = q.eq('status', filters.status)

  const { data } = await q

  type Shape = {
    id: string
    category: string
    subject: string
    status: string
    channels: string[]
    audience_summary: string | null
    scheduled_for: string | null
    sent_at: string | null
    created_at: string
    recipients: { delivery_status: string }[]
  }

  return ((data ?? []) as unknown as Shape[]).map((c) => {
    const recipients = c.recipients ?? []
    const counts = recipients.reduce(
      (acc, r) => {
        if (r.delivery_status === 'sent' || r.delivery_status === 'delivered') {
          acc.sent += 1
        }
        if (r.delivery_status === 'opened') {
          acc.sent += 1
          acc.opened += 1
        }
        if (r.delivery_status === 'replied') {
          acc.sent += 1
          acc.opened += 1
          acc.replied += 1
        }
        if (r.delivery_status === 'clicked') {
          acc.sent += 1
          acc.opened += 1
        }
        if (r.delivery_status === 'failed' || r.delivery_status === 'bounced') {
          acc.failed += 1
        }
        return acc
      },
      { sent: 0, opened: 0, replied: 0, failed: 0 },
    )
    return {
      id: c.id,
      category: c.category,
      subject: c.subject,
      status: c.status,
      channels: c.channels,
      audience_summary: c.audience_summary,
      scheduled_for: c.scheduled_for,
      sent_at: c.sent_at,
      created_at: c.created_at,
      totalRecipients: recipients.length,
      sentCount: counts.sent,
      openedCount: counts.opened,
      repliedCount: counts.replied,
      failedCount: counts.failed,
    }
  })
}

export interface CommunicationDetail extends CommunicationSummary {
  body_html: string
  body_text: string | null
  audience_definition: unknown
  related_resource: unknown
  ai_generated: boolean
  template: { id: string; name: string; category: string } | null
  recipients: {
    id: string
    unit_id: string | null
    recipient_name: string | null
    email: string | null
    phone: string | null
    channel: string
    delivery_status: string
    sent_at: string | null
    delivered_at: string | null
    opened_at: string | null
    replied_at: string | null
    failed_at: string | null
    error_message: string | null
  }[]
  replies: {
    id: string
    channel: string
    from_email: string | null
    from_phone: string | null
    subject: string | null
    body: string
    ai_summary: string | null
    received_at: string
    read_at: string | null
  }[]
}

export async function getCommunication(
  associationId: string,
  commId: string,
): Promise<CommunicationDetail | null> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('communications')
    .select(
      'id, category, subject, status, channels, audience_summary, scheduled_for, sent_at, created_at, ' +
        'body_html, body_text, audience_definition, related_resource, ai_generated, ' +
        'template:template_id(id, name, category), ' +
        'recipients:communication_recipients(id, unit_id, recipient_name, email, phone, channel, delivery_status, sent_at, delivered_at, opened_at, replied_at, failed_at, error_message), ' +
        'replies:communication_replies(id, channel, from_email, from_phone, subject, body, ai_summary, received_at, read_at)',
    )
    .eq('association_id', associationId)
    .eq('id', commId)
    .maybeSingle()

  if (!data) return null

  type Shape = {
    id: string
    category: string
    subject: string
    status: string
    channels: string[]
    audience_summary: string | null
    scheduled_for: string | null
    sent_at: string | null
    created_at: string
    body_html: string
    body_text: string | null
    audience_definition: unknown
    related_resource: unknown
    ai_generated: boolean
    template: { id: string; name: string; category: string } | null
    recipients: CommunicationDetail['recipients']
    replies: CommunicationDetail['replies']
  }
  const d = data as unknown as Shape

  const recipients = d.recipients ?? []
  const counts = recipients.reduce(
    (acc, r) => {
      if (r.delivery_status === 'sent' || r.delivery_status === 'delivered') acc.sent += 1
      if (r.delivery_status === 'opened') {
        acc.sent += 1
        acc.opened += 1
      }
      if (r.delivery_status === 'replied') {
        acc.sent += 1
        acc.opened += 1
        acc.replied += 1
      }
      if (r.delivery_status === 'clicked') {
        acc.sent += 1
        acc.opened += 1
      }
      if (r.delivery_status === 'failed' || r.delivery_status === 'bounced') acc.failed += 1
      return acc
    },
    { sent: 0, opened: 0, replied: 0, failed: 0 },
  )

  return {
    id: d.id,
    category: d.category,
    subject: d.subject,
    status: d.status,
    channels: d.channels,
    audience_summary: d.audience_summary,
    scheduled_for: d.scheduled_for,
    sent_at: d.sent_at,
    created_at: d.created_at,
    body_html: d.body_html,
    body_text: d.body_text,
    audience_definition: d.audience_definition,
    related_resource: d.related_resource,
    ai_generated: d.ai_generated,
    template: d.template,
    totalRecipients: recipients.length,
    sentCount: counts.sent,
    openedCount: counts.opened,
    repliedCount: counts.replied,
    failedCount: counts.failed,
    recipients,
    replies: d.replies ?? [],
  }
}

export async function listTemplates(
  organizationId: string,
  associationId: string,
): Promise<CommunicationTemplate[]> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('communication_templates')
    .select('*')
    .eq('organization_id', organizationId)
    .or(`association_id.is.null,association_id.eq.${associationId}`)
    .eq('is_active', true)
    .order('category')
    .order('name')
  return data ?? []
}
