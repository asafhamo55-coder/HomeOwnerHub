'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { Loader2, Send } from 'lucide-react'
import { Alert, Button, Input, Select } from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import { sendCommunication } from '@/lib/communications/send'

interface TemplateOption {
  id: string
  category: string
  name: string
  description: string
  subject: string
  bodyHtml: string
  bodyText: string
  channels: string[]
}

interface AudienceCounts {
  everyone: number
  owners_only: number
  tenants_only: number
  late_on_dues: number
  open_violations: number
}

type AudienceKind = keyof AudienceCounts

const AUDIENCE_LABELS: Record<AudienceKind, string> = {
  everyone: 'Everyone',
  owners_only: 'Owners only',
  tenants_only: 'Tenants only',
  late_on_dues: 'Late on dues',
  open_violations: 'Units with open violations',
}

const CATEGORIES = [
  'welcome',
  'dues',
  'meeting',
  'violation',
  'arc',
  'financial',
  'emergency',
  'announcement',
  'custom',
] as const

const CATEGORY_LABEL: Record<(typeof CATEGORIES)[number], string> = {
  welcome: 'Welcome',
  dues: 'Dues',
  meeting: 'Meeting',
  violation: 'Violation',
  arc: 'ARC',
  financial: 'Financial',
  emergency: 'Emergency',
  announcement: 'Announcement',
  custom: 'Custom',
}

const CHANNELS = ['email', 'portal'] as const

export function NewCommunicationWizard({
  templates,
  audienceCounts,
}: {
  templates: TemplateOption[]
  audienceCounts: AudienceCounts
}) {
  const router = useRouter()
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('announcement')
  const [audience, setAudience] = useState<AudienceKind>('everyone')
  const [templateId, setTemplateId] = useState<string>('')
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [channels, setChannels] = useState<string[]>(['email', 'portal'])
  const [scheduledFor, setScheduledFor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Templates relevant to the picked category come first; "Custom" gets
  // everything. Selecting a template pre-fills subject + body so the
  // manager can tweak before sending.
  const visibleTemplates = useMemo(
    () =>
      templates.filter(
        (t) => category === 'custom' || t.category === category,
      ),
    [templates, category],
  )

  function pickTemplate(id: string) {
    setTemplateId(id)
    const t = templates.find((x) => x.id === id)
    if (t) {
      setSubject(t.subject)
      setBodyHtml(t.bodyHtml)
      // Default to the template's channels but intersect with what we
      // support today (email + portal). SMS/mail get filtered out in v1.
      setChannels(t.channels.filter((c) => CHANNELS.includes(c as (typeof CHANNELS)[number])))
    }
  }

  function toggleChannel(c: string) {
    setChannels((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    )
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (!subject.trim() || !bodyHtml.trim() || channels.length === 0) {
      setError('Subject, body, and at least one channel are required.')
      return
    }

    startTransition(async () => {
      const result = await sendCommunication({
        category,
        subject: subject.trim(),
        bodyHtml,
        bodyText: stripHtml(bodyHtml),
        channels: channels as ('email' | 'portal' | 'sms' | 'mail')[],
        audience: { kind: audience },
        templateId: templateId || undefined,
        scheduledFor: scheduledFor || undefined,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      const msg = scheduledFor
        ? `Scheduled for ${new Date(scheduledFor).toLocaleString()}. ${result.recipientCount} recipient(s).`
        : `Sent. ${result.sentCount}/${result.recipientCount} delivered` +
          (result.failedCount > 0 ? `, ${result.failedCount} failed` : '') +
          '.'
      setSuccess(msg)
      // Bounce to the detail view after a half-second so the user sees the toast.
      setTimeout(() => {
        router.push(`/communications/${result.communicationId}`)
        router.refresh()
      }, 600)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Step 1 — topic */}
      <Section number={1} title="Topic" hint="What kind of message is this?">
        <Select
          value={category}
          onValueChange={(v) => {
            setCategory(v as (typeof CATEGORIES)[number])
            setTemplateId('')
          }}
          disabled={pending}
          placeholder="Choose a topic"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </Select>
      </Section>

      {/* Step 2 — audience */}
      <Section number={2} title="Audience" hint="Who receives this?">
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(AUDIENCE_LABELS) as AudienceKind[]).map((kind) => {
            const count = audienceCounts[kind]
            const selected = audience === kind
            return (
              <label
                key={kind}
                className={`flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm ${
                  selected
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border text-muted hover:bg-background'
                } ${count === 0 ? 'opacity-50' : ''}`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="audience"
                    value={kind}
                    checked={selected}
                    onChange={() => setAudience(kind)}
                    disabled={pending || count === 0}
                  />
                  {AUDIENCE_LABELS[kind]}
                </span>
                <span className="font-mono text-xs text-muted">{count}</span>
              </label>
            )
          })}
        </div>
      </Section>

      {/* Step 3 — template */}
      <Section number={3} title="Template" hint="Optional — pre-fills subject + body.">
        {visibleTemplates.length === 0 ? (
          <p className="text-xs italic text-muted">
            No templates in this category yet. Skip to step 4 and write a custom
            message.
          </p>
        ) : (
          <Select
            value={templateId}
            onValueChange={pickTemplate}
            disabled={pending}
            placeholder="— Custom (no template) —"
          >
            <option value="">— Custom (no template) —</option>
            {visibleTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        )}
      </Section>

      {/* Step 4 — subject + body */}
      <Section number={4} title="Message" hint="Edit before sending. {{ variables }} render per recipient.">
        <label className="block text-sm">
          <span className="text-muted">Subject</span>
          <Input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Welcome to Madison Park, {{ recipient_name }}"
            required
            disabled={pending}
            className="mt-1"
          />
        </label>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <label htmlFor="comm-body" className="text-sm text-muted">
              Body (HTML)
            </label>
            <AiRewriteButton
              value={bodyHtml}
              onChange={setBodyHtml}
              context={`HOA communication, category: ${CATEGORY_LABEL[category]}`}
              disabled={pending}
            />
          </div>
          <textarea
            id="comm-body"
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            placeholder="<p>Hi {{ recipient_name }}, ...</p>"
            required
            disabled={pending}
            rows={10}
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground"
          />
        </div>
      </Section>

      {/* Step 5 — channels + schedule */}
      <Section number={5} title="Channels & schedule" hint="Pick where this lands. Email goes via Resend; portal shows in-app.">
        <div className="flex flex-wrap gap-4">
          {CHANNELS.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={channels.includes(c)}
                onChange={() => toggleChannel(c)}
                disabled={pending}
              />
              {c}
            </label>
          ))}
        </div>
        <label className="mt-3 block text-sm">
          <span className="text-muted">Send at (leave blank to send now)</span>
          <Input
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            disabled={pending}
            className="mt-1"
          />
        </label>
      </Section>

      {error ? <Alert variant="error">{error}</Alert> : null}
      {success ? <Alert variant="success">{success}</Alert> : null}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {scheduledFor ? 'Schedule' : 'Send now'}
        </Button>
      </div>
    </form>
  )
}

function Section({
  number,
  title,
  hint,
  children,
}: {
  number: number
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-foreground">
          <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
            {number}
          </span>
          {title}
        </p>
        {hint ? <p className="ml-7 text-xs text-muted">{hint}</p> : null}
      </div>
      <div className="ml-7">{children}</div>
    </div>
  )
}

/** Strip HTML tags for the plain-text fallback we hand to Resend. Not
 *  a full sanitizer — just removes angle brackets so emails without
 *  HTML support stay legible. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
