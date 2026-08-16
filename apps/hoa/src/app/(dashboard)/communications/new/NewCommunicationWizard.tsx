'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { Loader2, Send } from 'lucide-react'
import { Alert, Button, Input, Select } from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import { sendCommunication } from '@/lib/communications/send'
import {
  listPropertyResidents,
  listBoardMembers,
  type ResidentOption,
  type BoardMemberOption,
} from '@/lib/communications/actions'
import { buildMergeBag, type AnswerMap } from '@/lib/community-templates/merge-bag'
import type { TemplateQuestion } from '@/lib/community-templates/types'
import {
  AudienceStep,
  type AudienceCounts,
  type AudienceKind,
  type ManualContact,
  type PropertyOption,
} from './AudienceStep'
import { QuestionStep } from './QuestionStep'
import { SectionToggles } from './SectionToggles'

interface TemplateOption {
  id: string
  category: string
  name: string
  description: string
  subject: string
  bodyHtml: string
  bodyText: string
  channels: string[]
  // Optional because not every caller of this component supplies it yet
  // (the community-template library's questions are wired in separately).
  // QuestionStep and handleSubmit both treat a missing array as "no
  // declared questions" rather than crashing.
  questions?: readonly TemplateQuestion[]
  /** Community-library slug, or null for an org-authored template. When
   *  present the composer can offer per-section toggles; when null it falls
   *  back to the stored body_html, which is the pre-sections behaviour. */
  topicSlug?: string | null
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
  'community',
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
  community: 'Community',
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
  const [answers, setAnswers] = useState<AnswerMap>({})
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

  // Board audience state. Loaded lazily when "Board" is picked. Defaults
  // to ALL checked — the sender opts a board member OUT rather than
  // having to opt each one in (mirrors the resident picker).
  const [boardMembers, setBoardMembers] = useState<BoardMemberOption[]>([])
  const [boardLoading, setBoardLoading] = useState(false)
  const [checkedBoardIds, setCheckedBoardIds] = useState<Set<string>>(new Set())

  // Manual contacts audience state.
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

  // Load board members whenever "Board" becomes the chosen audience.
  // Default every member checked.
  useEffect(() => {
    if (audience !== 'board') return
    let cancelled = false
    setBoardLoading(true)
    listBoardMembers()
      .then((rows) => {
        if (cancelled) return
        setBoardMembers(rows)
        // Default to the board role only — admins are listed but left
        // unchecked, so they're opt-in per send.
        setCheckedBoardIds(
          new Set(rows.filter((r) => r.role === 'board').map((r) => r.userId)),
        )
      })
      .finally(() => {
        if (!cancelled) setBoardLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [audience])

  function toggleBoardMember(id: string) {
    setCheckedBoardIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function selectAllBoard() {
    setCheckedBoardIds(new Set(boardMembers.map((r) => r.userId)))
  }
  function clearBoard() {
    setCheckedBoardIds(new Set())
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
  const selectedTemplate = templates.find((t) => t.id === templateId)

  // Answers are keyed by question id, and question ids are only unique
  // *within* a template — reset on every templateId change (picking a
  // template, switching back to Custom, or switching category, which
  // clears templateId too) so a stale answer never leaks into a
  // differently-shaped template and trips buildMergeBag's "undeclared
  // question" guard.
  useEffect(() => {
    setAnswers({})
    setActiveQuestions(null)
  }, [templateId])

  // Questions still referenced by an included section. null means "no
  // section filtering in play" — either a non-community template or the
  // toggles have not reported yet — in which case the template's full list
  // applies, which is the pre-sections behaviour.
  const [activeQuestions, setActiveQuestions] = useState<readonly TemplateQuestion[] | null>(null)

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

  const effectiveQuestions: readonly TemplateQuestion[] =
    activeQuestions ?? selectedTemplate?.questions ?? []

  // Which questions currently hold a real answer, as a sorted stable string.
  // A multiselect answers as an array, so an empty array counts as blank.
  const answeredKey = useMemo(() => {
    const ids = Object.entries(answers)
      .filter(([, v]) => (Array.isArray(v) ? v.length > 0 : String(v ?? '').trim() !== ''))
      .map(([k]) => k)
      .sort()
    return ids.join(',')
  }, [answers])

  // useCallback so SectionToggles' effect, which intentionally omits this
  // from its dep list, is nonetheless given a stable identity.
  const handleSectionsRendered = useCallback(
    (r: { bodyHtml: string; questions: readonly TemplateQuestion[] }) => {
      setBodyHtml(r.bodyHtml)
      setActiveQuestions(r.questions)
    },
    [],
  )

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

    // Validate the template's declared-question answers now, before the
    // audience is even resolved. buildMergeBag throws on a missing
    // required answer — surfacing that here, as a named error, is what
    // stands between the board member and a wall of per-recipient send
    // failures (renderTemplateStrict throws in send.ts for every
    // recipient otherwise).
    //
    // The resulting bag is passed to sendCommunication as `extraFields`
    // rather than substituted here. Subject/body are sent as-is, still
    // carrying every {{ placeholder }} — including the ambient ones
    // (recipient_name, association_name, owner_name, unit_id), which this
    // step deliberately does not touch. deliverOne (send.ts) merges this
    // bag UNDER the ambient, per-recipient values and renders strictly.
    // Substituting here first would run renderTemplate — which blanks any
    // placeholder not in `bag`, and the ambient ones never are — wiping
    // {{association_name}} and {{recipient_name}} before send.ts ever
    // sees them.
    const finalSubject = subject.trim()
    const finalBodyHtml = bodyHtml
    let extraFields: ReturnType<typeof buildMergeBag> | undefined
    if (effectiveQuestions.length) {
      try {
        // effectiveQuestions, not the template's full list: a question whose
        // only section was switched off is no longer asked, so requiring an
        // answer for it would block the send on data that cannot appear.
        extraFields = buildMergeBag(effectiveQuestions, answers, {})
      } catch (err) {
        setError((err as Error).message)
        return
      }
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
    } else if (audience === 'board') {
      if (checkedBoardIds.size === 0) {
        setError('Pick at least one board member.')
        return
      }
      // Omit the id list (⇒ "the whole board") only when exactly every
      // board-role member is checked and no admins — so it stays correct
      // if the roster changes before sending. Any admin pick or board
      // deselect sends explicit ids.
      const boardRoleIds = boardMembers
        .filter((m) => m.role === 'board')
        .map((m) => m.userId)
      const isWholeBoard =
        boardRoleIds.length > 0 &&
        checkedBoardIds.size === boardRoleIds.length &&
        boardRoleIds.every((id) => checkedBoardIds.has(id))
      audienceDef = isWholeBoard
        ? { kind: 'board' }
        : { kind: 'board', boardUserIds: Array.from(checkedBoardIds) }
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
        subject: finalSubject,
        bodyHtml: finalBodyHtml,
        bodyText: stripHtml(finalBodyHtml),
        channels: channels as ('email' | 'portal' | 'sms' | 'mail')[],
        audience: audienceDef,
        templateId: templateId || undefined,
        scheduledFor: scheduledFor || undefined,
        extraFields,
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
      // Redirect immediately — the detail page shows the same success
      // info plus per-recipient delivery status. No artificial wait.
      router.push(`/communications/${result.communicationId}`)
      router.refresh()
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
        <AudienceStep
          pending={pending}
          audience={audience}
          setAudience={setAudience}
          audienceCounts={audienceCounts}
          properties={properties}
          manualContacts={manualContacts}
          draftName={draftName}
          setDraftName={setDraftName}
          draftEmail={draftEmail}
          setDraftEmail={setDraftEmail}
          draftPhone={draftPhone}
          setDraftPhone={setDraftPhone}
          addManualContact={addManualContact}
          setError={setError}
          removeContact={removeContact}
          selectedPropertyId={selectedPropertyId}
          setSelectedPropertyId={setSelectedPropertyId}
          residents={residents}
          residentsLoading={residentsLoading}
          checkedResidentIds={checkedResidentIds}
          toggleResident={toggleResident}
          selectAllResidents={selectAllResidents}
          selectByRole={selectByRole}
          clearResidents={clearResidents}
          boardMembers={boardMembers}
          boardLoading={boardLoading}
          checkedBoardIds={checkedBoardIds}
          toggleBoardMember={toggleBoardMember}
          selectAllBoard={selectAllBoard}
          clearBoard={clearBoard}
        />
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

      {/* Step 4 — declared questions, only shown when the chosen template
          has any. Answers become the merge bag for its {{ fields }} —
          see handleSubmit, which builds and substitutes it before send. */}
      {effectiveQuestions.length > 0 ? (
        <Section
          number={4}
          title="Details"
          hint="Answers fill in this template's {{ merge fields }}."
        >
          <QuestionStep
            questions={effectiveQuestions}
            answers={answers}
            onChange={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))}
          />
        </Section>
      ) : null}

      {/* Step 5 — subject + body */}
      <Section number={5} title="Message" hint="Edit before sending. {{ variables }} render per recipient.">
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
        {selectedTemplate?.topicSlug ? (
          <SectionToggles
            topicSlug={selectedTemplate.topicSlug}
            answeredKey={answeredKey}
            disabled={pending}
            onRendered={handleSectionsRendered}
          />
        ) : null}

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

      {/* Step 6 — channels + schedule */}
      <Section number={6} title="Channels & schedule" hint="Pick where this lands. Portal messages show in the resident's in-app inbox.">
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
