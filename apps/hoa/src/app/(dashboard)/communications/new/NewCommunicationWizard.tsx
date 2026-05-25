'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { Loader2, Mail, Phone, Plus, Send, Users2, X } from 'lucide-react'
import { Alert, Button, Input, Select } from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import { sendCommunication } from '@/lib/communications/send'
import {
  listPropertyResidents,
  type ResidentOption,
} from '@/lib/communications/actions'

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

interface PropertyOption {
  id: string
  label: string
}

// 'specific_property' drives the property + resident-picker UI; on
// submit it converts to the resolver's 'specific_residents' shape.
// 'manual_emails' drives a free-form email entry list — also passes
// through to the resolver as-is.
type AudienceKind =
  | keyof AudienceCounts
  | 'specific_property'
  | 'manual_emails'

const AUDIENCE_LABELS: Record<AudienceKind, string> = {
  everyone: 'Everyone',
  owners_only: 'Owners only',
  tenants_only: 'Tenants only',
  late_on_dues: 'Late on dues',
  open_violations: 'Units with open violations',
  specific_property: 'Specific property',
  manual_emails: 'Custom contacts',
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

const CHANNELS = ['email', 'sms', 'portal'] as const

export function NewCommunicationWizard({
  templates,
  audienceCounts,
  properties,
}: {
  templates: TemplateOption[]
  audienceCounts: AudienceCounts
  properties: PropertyOption[]
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

  // Specific-property audience state.
  // selectedPropertyId — single property at a time keeps the UI simple.
  // residents — loaded via server action when a property is picked.
  // checkedResidentIds — which named residents at that property to send to.
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('')
  const [residents, setResidents] = useState<ResidentOption[]>([])
  const [residentsLoading, setResidentsLoading] = useState(false)
  const [checkedResidentIds, setCheckedResidentIds] = useState<Set<string>>(new Set())

  // Manual contacts audience state.
  interface ManualContact { email: string; phone: string; name: string }
  const [manualContacts, setManualContacts] = useState<ManualContact[]>([])
  const [draftEmail, setDraftEmail] = useState('')
  const [draftPhone, setDraftPhone] = useState('')
  const [draftName, setDraftName] = useState('')
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const US_PHONE_RE = /^(\+?1?\s*)?(\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}$/

  function addManualContact(): { ok: true } | { ok: false; error: string } {
    const email = draftEmail.trim().toLowerCase()
    const phone = draftPhone.trim()
    const name = draftName.trim()
    if (!email && !phone) return { ok: false, error: 'Enter an email or phone number.' }
    if (email && !EMAIL_RE.test(email)) return { ok: false, error: `"${email}" doesn't look like a valid email.` }
    if (phone && !US_PHONE_RE.test(phone)) return { ok: false, error: `"${phone}" doesn't look like a US phone number.` }
    const alreadyExists = manualContacts.some(
      (c) => (email && c.email === email) || (phone && c.phone === phone),
    )
    if (alreadyExists) return { ok: false, error: 'This contact is already in the list.' }
    setManualContacts((prev) => [...prev, { email, phone, name }])
    setDraftEmail('')
    setDraftPhone('')
    setDraftName('')
    return { ok: true }
  }
  function removeContact(index: number) {
    setManualContacts((prev) => prev.filter((_, i) => i !== index))
  }

  // Load residents whenever a property is selected. Default to ALL
  // checked — the sender opts OUT of a resident, rather than having to
  // opt every single one in.
  useEffect(() => {
    if (audience !== 'specific_property' || !selectedPropertyId) {
      setResidents([])
      setCheckedResidentIds(new Set())
      return
    }
    let cancelled = false
    setResidentsLoading(true)
    listPropertyResidents(selectedPropertyId)
      .then((rows) => {
        if (cancelled) return
        setResidents(rows)
        setCheckedResidentIds(new Set(rows.map((r) => r.id)))
      })
      .finally(() => {
        if (!cancelled) setResidentsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [audience, selectedPropertyId])

  function toggleResident(id: string) {
    setCheckedResidentIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function selectAllResidents() {
    setCheckedResidentIds(new Set(residents.map((r) => r.id)))
  }
  function selectByRole(role: ResidentOption['role']) {
    setCheckedResidentIds(
      new Set(residents.filter((r) => r.role === role).map((r) => r.id)),
    )
  }
  function clearResidents() {
    setCheckedResidentIds(new Set())
  }

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

    // Translate the wizard-local 'specific_property' kind into the
    // resolver's 'specific_residents' shape with the checked ids.
    let audienceDef: Parameters<typeof sendCommunication>[0]['audience']
    if (audience === 'specific_property') {
      if (!selectedPropertyId) {
        setError('Pick a property first.')
        return
      }
      if (checkedResidentIds.size === 0) {
        setError('Pick at least one resident at that property.')
        return
      }
      audienceDef = {
        kind: 'specific_residents',
        residentIds: Array.from(checkedResidentIds),
      }
    } else if (audience === 'manual_emails') {
      // Fold any in-flight draft into the committed list before sending.
      let contacts = [...manualContacts]
      const dEmail = draftEmail.trim().toLowerCase()
      const dPhone = draftPhone.trim()
      if (dEmail || dPhone) {
        if (dEmail && !EMAIL_RE.test(dEmail)) {
          setError(`"${dEmail}" doesn't look like an email.`)
          return
        }
        if (dPhone && !US_PHONE_RE.test(dPhone)) {
          setError(`"${dPhone}" doesn't look like a US phone number.`)
          return
        }
        contacts.push({ email: dEmail, phone: dPhone, name: draftName.trim() })
      }
      if (contacts.length === 0) {
        setError('Add at least one contact.')
        return
      }
      audienceDef = {
        kind: 'manual_emails',
        emails: contacts.map((c) => c.email),
        emailNames: contacts.map((c) => c.name),
        phones: contacts.map((c) => c.phone),
      }
    } else {
      audienceDef = { kind: audience }
    }

    startTransition(async () => {
      const result = await sendCommunication({
        category,
        subject: subject.trim(),
        bodyHtml,
        bodyText: stripHtml(bodyHtml),
        channels: channels as ('email' | 'portal' | 'sms' | 'mail')[],
        audience: audienceDef,
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
            const selected = audience === kind
            const count =
              kind === 'specific_property'
                ? properties.length
                : kind === 'manual_emails'
                  ? manualContacts.length
                  : audienceCounts[kind as keyof AudienceCounts]
            const disabled =
              pending ||
              (kind !== 'specific_property' &&
                kind !== 'manual_emails' &&
                count === 0)
            return (
              <label
                key={kind}
                className={`flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm ${
                  selected
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border text-muted hover:bg-background'
                } ${disabled ? 'opacity-50' : ''}`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="audience"
                    value={kind}
                    checked={selected}
                    onChange={() => setAudience(kind)}
                    disabled={disabled}
                  />
                  {AUDIENCE_LABELS[kind]}
                </span>
                <span className="font-mono text-xs text-muted">{count}</span>
              </label>
            )
          })}
        </div>

        {/* Property picker + resident checkboxes — only when
            "Specific property" is the chosen audience. */}
        {/* Manual email entry — typed-in addresses for one-off
            recipients (vendor, attorney, anyone not in the roster). */}
        {audience === 'manual_emails' ? (
          <div className="mt-4 space-y-3 rounded-md border border-border bg-background/40 p-4">
            <p className="text-xs text-muted">
              Add contacts by email and/or US phone number. At least one is
              required per contact. Useful for one-off messages to people not
              in the resident list — vendors, attorneys, contractors.
            </p>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <Input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Name (optional)"
                disabled={pending}
              />
              <Input
                type="email"
                value={draftEmail}
                onChange={(e) => setDraftEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const result = addManualContact()
                    if (!result.ok) setError(result.error)
                  }
                }}
                placeholder="email@example.com"
                disabled={pending}
              />
              <Input
                type="tel"
                value={draftPhone}
                onChange={(e) => setDraftPhone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const result = addManualContact()
                    if (!result.ok) setError(result.error)
                  }
                }}
                placeholder="(555) 123-4567"
                disabled={pending}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const result = addManualContact()
                  if (!result.ok) setError(result.error)
                }}
                disabled={pending || (!draftEmail.trim() && !draftPhone.trim())}
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>

            {manualContacts.length === 0 ? (
              <p className="flex items-center gap-2 text-xs italic text-muted">
                <Users2 className="h-3.5 w-3.5" />
                No contacts added yet.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {manualContacts.map((c, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      {c.name ? <span className="font-medium text-foreground">{c.name}</span> : null}
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                        {c.email ? (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {c.email}
                          </span>
                        ) : null}
                        {c.phone ? (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {c.phone}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeContact(i)}
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Remove ${c.name || c.email || c.phone}`}
                      disabled={pending}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {audience === 'specific_property' ? (
          <div className="mt-4 space-y-3 rounded-md border border-border bg-background/40 p-4">
            <div>
              <label className="text-xs font-medium text-foreground" htmlFor="comm-property">
                Property
              </label>
              <Select
                id="comm-property"
                value={selectedPropertyId}
                onValueChange={setSelectedPropertyId}
                disabled={pending}
                placeholder="Choose a property"
                className="mt-1"
              >
                <option value="" disabled>
                  — pick one —
                </option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>

            {selectedPropertyId ? (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-foreground">
                    Who at this property?{' '}
                    <span className="font-normal text-muted">
                      ({checkedResidentIds.size} selected)
                    </span>
                  </p>
                  {residents.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <button
                        type="button"
                        className="rounded-full border border-border bg-surface px-2 py-0.5 hover:bg-background"
                        onClick={selectAllResidents}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-border bg-surface px-2 py-0.5 hover:bg-background"
                        onClick={() => selectByRole('owner')}
                      >
                        Owners
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-border bg-surface px-2 py-0.5 hover:bg-background"
                        onClick={() => selectByRole('tenant')}
                      >
                        Tenants
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-border bg-surface px-2 py-0.5 hover:bg-background"
                        onClick={clearResidents}
                      >
                        None
                      </button>
                    </div>
                  ) : null}
                </div>

                {residentsLoading ? (
                  <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading residents…
                  </p>
                ) : residents.length === 0 ? (
                  <p className="mt-3 flex items-center gap-2 text-xs italic text-muted">
                    <Users2 className="h-3.5 w-3.5" />
                    No active residents recorded for this property.
                    Add residents on the property detail page first.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-border rounded-md border border-border bg-surface">
                    {residents.map((r) => {
                      const checked = checkedResidentIds.has(r.id)
                      return (
                        <li key={r.id}>
                          <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-background/50">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleResident(r.id)}
                              disabled={pending}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-foreground">
                                {r.fullName}
                                {r.isPrimary ? (
                                  <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-primary">
                                    primary
                                  </span>
                                ) : null}
                              </p>
                              <p className="text-xs text-muted">
                                {roleHumanLabel(r.role)}
                                {r.email ? ` · ${r.email}` : ' · no email on file'}
                              </p>
                            </div>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
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

function roleHumanLabel(role: ResidentOption['role']): string {
  switch (role) {
    case 'owner': return 'Owner'
    case 'tenant': return 'Tenant'
    case 'family_member': return 'Family member'
    case 'other': return 'Resident'
  }
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
