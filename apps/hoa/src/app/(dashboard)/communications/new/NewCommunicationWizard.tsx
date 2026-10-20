'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { ArrowLeft, ArrowRight, CalendarClock, Send } from 'lucide-react'
import {
  Alert,
  Button,
  Checkbox,
  Field,
  Fieldset,
  Input,
  KeyValue,
  KeyValueList,
  Select,
  Textarea,
  WizardStepper,
  cn,
} from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import { sendCommunication } from '@/lib/communications/send'
import { previewOfficialNotice, type OfficialNoticePreview } from '@/lib/communications/official-notice-actions'
import { previewPreferenceSkips, type PreferencePreview } from '@/lib/communications/preference-actions'
import { BUILT_IN_TEMPLATES, isBuiltInTemplateId } from '@/lib/communications/built-in-templates'
import { SCHEDULING_COMING_SOON, SCHEDULING_ENABLED } from '@/lib/communications/scheduling'
import { paperNoticeLabel } from '@/lib/communications/official-notice'
import { SMS_CHANNEL_HINT } from '@/lib/communications/sms-body'
import { SMS_ENGLISH_ONLY_NOTE, composeBilingualSms, htmlToPlainText } from '@/lib/communications/bilingual'
import {
  listPropertyResidents,
  listBoardMembers,
  type ResidentOption,
  type BoardMemberOption,
} from '@/lib/communications/actions'
import { buildMergeBag, type AnswerMap } from '@/lib/community-templates/merge-bag'
import type { TemplateQuestion } from '@/lib/community-templates/types'
import {
  AUDIENCE_LABELS,
  AudienceStep,
  type AudienceCounts,
  type AudienceKind,
  type ManualContact,
  type PropertyOption,
} from './AudienceStep'
import { BUDGET_NOTICE_FROM, readBudgetNoticeDraft, sessionStore } from '@/lib/budget-notice/draft-handoff'
import { QuestionStep } from './QuestionStep'
import { SectionToggles } from './SectionToggles'
import { SpanishVersion, type SpanishDraft } from './SpanishVersion'

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
  /** BL-102 A4: a code-defined built-in (lib/communications/built-in-templates.ts),
   *  available to every HOA. Sent with no templateId. */
  builtIn?: boolean
}

/** The built-in library as composer options — listed first, for every HOA. */
const BUILT_IN_OPTIONS: TemplateOption[] = BUILT_IN_TEMPLATES.map((t) => ({
  id: t.id,
  category: t.category,
  name: t.name,
  description: t.description,
  subject: t.subject,
  bodyHtml: t.bodyHtml,
  bodyText: '',
  channels: t.channels,
  questions: t.questions,
  topicSlug: null,
  builtIn: true,
}))

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

const CHANNEL_COPY: Record<(typeof CHANNELS)[number], { label: string; hint: string }> = {
  email: { label: 'Email', hint: 'To every recipient with an email on file, unless they opted out' },
  // Only residents who opted in to texts get one (BL-102); said in the guide.
  sms: { label: 'Text', hint: SMS_CHANNEL_HINT },
  portal: { label: 'Portal', hint: "Shows in the resident's in-app inbox" },
}

/** Shown on the Text option when Vonage isn't configured (BL-102). */
export const SMS_NOT_SET_UP = 'Texting isn’t set up yet.'

const STEPS = [
  { id: 'audience', label: 'Template & audience' },
  { id: 'message', label: 'Message' },
  { id: 'delivery', label: 'Review & send' },
] as const

/** Field-level errors, keyed by field (questions as `q:<id>`). */
type FieldErrors = Record<string, string>

export function NewCommunicationWizard({
  templates,
  audienceCounts,
  properties,
  initialPropertyId = null,
  officialNoticeOffered = false,
  prefillFrom = null,
  smsConfigured = false,
}: {
  templates: TemplateOption[]
  audienceCounts: AudienceCounts
  properties: PropertyOption[]
  /**
   * Opened from a property page ("Message owner"): start on the
   * "Specific property" audience with that home picked, so its residents
   * load already checked. Ignored unless it is one of `properties`.
   */
  initialPropertyId?: string | null
  /**
   * BL-020: offer "This is an official notice" on the Review step. True
   * only for a California association once M1 is applied (page.tsx);
   * false renders and sends exactly what the composer always did.
   */
  officialNoticeOffered?: boolean
  /**
   * BL-091: `?from=budget-notice` — pre-fill the subject and body from the
   * owner budget notice the board just prepared (handed over in this tab's
   * sessionStorage). Only pre-fills: the board still picks the audience,
   * reviews and sends as usual.
   */
  prefillFrom?: typeof BUDGET_NOTICE_FROM | null
  /**
   * BL-102: false when the Vonage keys are missing (lib/sms.ts
   * smsConfigured). The Text channel is then disabled with "Texting isn't
   * set up yet", instead of offering a send that can't go out.
   */
  smsConfigured?: boolean
}) {
  const preselect = initialPropertyId && properties.some((p) => p.id === initialPropertyId) ? initialPropertyId : null
  const router = useRouter()
  // BL-102 A4: no Topic step. A template brings its own category; a
  // message written from scratch is filed as an announcement (or, from the
  // budget notice, as financial).
  const [baseCategory, setBaseCategory] = useState<(typeof CATEGORIES)[number]>('announcement')
  const [audience, setAudience] = useState<AudienceKind>(preselect ? 'specific_property' : 'everyone')
  const [templateId, setTemplateId] = useState<string>('')
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [channels, setChannels] = useState<string[]>(['email', 'portal'])
  const [scheduledFor, setScheduledFor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [step, setStep] = useState(0)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  // BL-025: the optional, board-reviewed Spanish version.
  const [spanish, setSpanish] = useState<SpanishDraft | null>(null)
  // BL-020: official notice (CA Civ. Code §4040) and its Review-step preview.
  const [officialNotice, setOfficialNotice] = useState(false)
  const [officialPreview, setOfficialPreview] = useState<OfficialNoticePreview | null>(null)
  // BL-091: 'loaded' once the budget notice is in the composer, 'missing'
  // when the hand-off didn't arrive (storage blocked, or a new tab).
  const [prefill, setPrefill] = useState<'loaded' | 'missing' | null>(null)
  useEffect(() => {
    if (prefillFrom !== BUDGET_NOTICE_FROM) return
    const draft = readBudgetNoticeDraft(sessionStore())
    if (!draft) {
      setPrefill('missing')
      return
    }
    setBaseCategory('financial')
    setAudience('owners_only')
    setSubject(draft.subject)
    setBodyHtml(draft.bodyHtml)
    setPrefill('loaded')
  }, [prefillFrom])

  // Specific-property audience state.
  // selectedPropertyId — single property at a time keeps the UI simple.
  // residents — loaded via server action when a property is picked.
  // checkedResidentIds — which named residents at that property to send to.
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(preselect ?? '')
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

  // BL-102 A4: every template is listed, never filtered by a topic — the
  // built-ins first (every HOA has them), then the HOA's own templates and
  // the shared community library. Selecting one pre-fills subject + body so
  // the manager can tweak before sending.
  const allTemplates = useMemo(() => [...BUILT_IN_OPTIONS, ...templates], [templates])
  const selectedTemplate = allTemplates.find((t) => t.id === templateId)
  const category = (
    selectedTemplate && (CATEGORIES as readonly string[]).includes(selectedTemplate.category)
      ? selectedTemplate.category
      : baseCategory
  ) as (typeof CATEGORIES)[number]

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
    const t = allTemplates.find((x) => x.id === id)
    if (t) {
      setSubject(t.subject)
      setBodyHtml(t.bodyHtml)
      // Default to the template's channels but intersect with what we
      // support (email, portal, and text only once texting is set up).
      const next = t.channels.filter(
        (c) => CHANNELS.includes(c as (typeof CHANNELS)[number]) && (c !== 'sms' || smsConfigured),
      )
      setChannels(next.length > 0 ? next : ['email', 'portal'])
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

  /** Per-step checks, shown beside the field they concern. */
  function errorsForStep(i: number): FieldErrors {
    const errs: FieldErrors = {}
    if (i === 0) {
      if (audience === 'specific_property') {
        if (!selectedPropertyId) errs.audience = 'Pick a property first.'
        else if (checkedResidentIds.size === 0) errs.audience = 'Pick at least one resident at that property.'
      } else if (audience === 'board' && checkedBoardIds.size === 0) {
        errs.audience = 'Pick at least one board member.'
      } else if (
        audience === 'manual_emails' &&
        manualContacts.length === 0 &&
        !draftEmail.trim() &&
        !draftPhone.trim()
      ) {
        errs.audience = 'Add at least one contact.'
      }
    }
    if (i === 1) {
      if (!subject.trim()) errs.subject = 'Write a subject.'
      if (!bodyHtml.trim()) errs.body = 'Write the message body.'
      for (const q of effectiveQuestions) {
        if (!q.required) continue
        const v = answers[q.id]
        const blank = Array.isArray(v) ? v.length === 0 : String(v ?? '').trim() === ''
        if (blank) errs[`q:${q.id}`] = 'Required — this answer fills a merge field in the message.'
      }
      if (spanish) {
        if (!spanish.subject.trim() || !spanish.bodyHtml.trim()) {
          errs.spanish = 'The Spanish subject and body can’t be empty — fill them in or remove the Spanish version.'
        } else if (!spanish.viewed) {
          errs.spanish = 'Read the Spanish version and tick the box before sending.'
        }
      }
    }
    if (i === 2 && channels.filter((c) => c !== 'sms' || smsConfigured).length === 0) {
      errs.channels = 'Pick at least one channel.'
    }
    return errs
  }

  /** Validate step `i`; on failure show its errors and return false. */
  function checkStep(i: number): boolean {
    const errs = errorsForStep(i)
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  function goTo(next: number) {
    setError(null)
    if (next > step && !checkStep(step)) return
    if (next < step) setFieldErrors({})
    setStep(next)
    // Bring the new step's top into view (long steps on phones).
    requestAnimationFrame(() => document.getElementById('wizard-top')?.scrollIntoView({ block: 'nearest' }))
  }

  const lastStep = STEPS.length - 1

  type AudienceDef = Parameters<typeof sendCommunication>[0]['audience']

  /** The resolver's audience for the current picks — shared by the send and the official-notice preview. */
  function buildAudienceDef(): { ok: true; def: AudienceDef } | { ok: false; error: string } {
    // Translate the wizard-local 'specific_property' kind into the
    // resolver's 'specific_residents' shape with the checked ids.
    let audienceDef: AudienceDef
    if (audience === 'specific_property') {
      if (!selectedPropertyId) {
        return { ok: false, error: 'Pick a property first.' }
      }
      if (checkedResidentIds.size === 0) {
        return { ok: false, error: 'Pick at least one resident at that property.' }
      }
      audienceDef = {
        kind: 'specific_residents',
        residentIds: Array.from(checkedResidentIds),
      }
    } else if (audience === 'board') {
      if (checkedBoardIds.size === 0) {
        return { ok: false, error: 'Pick at least one board member.' }
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
          return { ok: false, error: `"${dEmail}" doesn't look like an email.` }
        }
        if (dPhone && !US_PHONE_RE.test(dPhone)) {
          return { ok: false, error: `"${dPhone}" doesn't look like a US phone number.` }
        }
        contacts.push({ email: dEmail, phone: dPhone, name: draftName.trim() })
      }
      if (contacts.length === 0) {
        return { ok: false, error: 'Add at least one contact.' }
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
    return { ok: true, def: audienceDef }
  }

  // BL-020: on the Review step, list who this official notice won't reach
  // by email. Re-run whenever the audience or channels change; the send
  // recomputes the same plan server-side, so this is a preview, not a promise.
  const officialActive = officialNoticeOffered && officialNotice && step === lastStep
  useEffect(() => {
    if (!officialActive) {
      setOfficialPreview(null)
      return
    }
    const built = buildAudienceDef()
    if (!built.ok) {
      setOfficialPreview({ ok: false, error: built.error })
      return
    }
    let cancelled = false
    setOfficialPreview(null)
    previewOfficialNotice(built.def, channels)
      .then((r) => {
        if (!cancelled) setOfficialPreview(r)
      })
      .catch(() => {
        if (!cancelled) setOfficialPreview({ ok: false, error: 'Couldn’t check e-consent. Try again before sending.' })
      })
    return () => {
      cancelled = true
    }
    // buildAudienceDef reads exactly these picks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officialActive, audience, selectedPropertyId, checkedResidentIds, checkedBoardIds, boardMembers, manualContacts, channels])

  // BL-102: on the Review step, how many recipients each channel skips
  // because of their own preferences. The send applies the same policy, so
  // this is what it will do.
  const [prefPreview, setPrefPreview] = useState<PreferencePreview | null>(null)
  const reviewing = step === lastStep
  useEffect(() => {
    if (!reviewing) {
      setPrefPreview(null)
      return
    }
    const built = buildAudienceDef()
    if (!built.ok) {
      setPrefPreview(null)
      return
    }
    let cancelled = false
    setPrefPreview(null)
    previewPreferenceSkips(built.def, channels, officialNoticeOffered && officialNotice)
      .then((r) => {
        if (!cancelled) setPrefPreview(r)
      })
      .catch(() => {
        if (!cancelled) setPrefPreview({ ok: false, error: 'Couldn’t check residents’ message preferences.' })
      })
    return () => {
      cancelled = true
    }
    // buildAudienceDef reads exactly these picks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewing, audience, selectedPropertyId, checkedResidentIds, checkedBoardIds, boardMembers, manualContacts, channels, officialNotice])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Enter inside an earlier step means "continue", never "send".
    if (step < lastStep) {
      goTo(step + 1)
      return
    }
    for (let i = 0; i <= lastStep; i++) {
      if (!checkStep(i)) {
        setStep(i)
        return
      }
    }
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

    const built = buildAudienceDef()
    if (!built.ok) {
      setError(built.error)
      return
    }
    const audienceDef = built.def

    // datetime-local has no zone; read it in the board member's own zone
    // and send an absolute instant, so 9:00 means 9:00 where they are.
    const scheduledAt = SCHEDULING_ENABLED && scheduledFor ? new Date(scheduledFor) : null
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
      setError('Pick a valid date and time to send it, or clear the field to send now.')
      return
    }

    startTransition(async () => {
      const result = await sendCommunication({
        category,
        subject: finalSubject,
        bodyHtml: finalBodyHtml,
        bodyText: stripHtml(finalBodyHtml),
        // Never send a text channel the server can't deliver (BL-102).
        channels: channels.filter((c) => c !== 'sms' || smsConfigured) as ('email' | 'portal' | 'sms' | 'mail')[],
        audience: audienceDef,
        // Built-ins have no communication_templates row.
        templateId: templateId && !isBuiltInTemplateId(templateId) ? templateId : undefined,
        scheduledFor: scheduledAt ? scheduledAt.toISOString() : undefined,
        extraFields,
        spanish: spanish
          ? { subject: spanish.subject.trim(), bodyHtml: spanish.bodyHtml, reviewed: spanish.viewed }
          : undefined,
        // Spread, not `officialNotice: false`: an unmarked send's payload stays exactly as before.
        ...(officialNotice ? { officialNotice: true } : {}),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      const msg = scheduledAt
        ? `Scheduled for ${scheduledAt.toLocaleString()}. ${result.recipientCount} recipient(s).`
        : `Sent. ${result.sentCount}/${result.recipientCount} delivered` +
          (result.failedCount > 0 ? `, ${result.failedCount} failed` : '') +
          '.' +
          (result.paperNotice ? ` ${paperNoticeLabel(result.paperNotice.count)}.` : '')
      setSuccess(msg)
      // Redirect immediately — the detail page shows the same success
      // info plus per-recipient delivery status. No artificial wait.
      router.push(`/communications/${result.communicationId}`)
      router.refresh()
    })
  }

  const questionErrors = Object.fromEntries(
    Object.entries(fieldErrors)
      .filter(([k]) => k.startsWith('q:'))
      .map(([k, v]) => [k.slice(2), v]),
  )
  // SMS estimate on the unrendered text: merge fields change the length per
  // recipient, and the server decides for real at send time.
  const smsEnglishOnly =
    spanish !== null &&
    channels.includes('sms') &&
    !composeBilingualSms({
      subject: subject.trim(),
      englishText: htmlToPlainText(bodyHtml),
      spanish: { subject: spanish.subject, text: htmlToPlainText(spanish.bodyHtml) },
      portalLink: 'https://www.homeownerledger.com/communications/00000000-0000-0000-0000-000000000000',
    }).spanishIncluded

  const audienceCount =
    audience === 'specific_property'
      ? checkedResidentIds.size
      : audience === 'board'
        ? checkedBoardIds.size
        : audience === 'manual_emails'
          ? manualContacts.length
          : audienceCounts[audience]

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col">
      <div id="wizard-top" className="scroll-mt-24 border-b border-border p-5 sm:px-6">
        <WizardStepper steps={STEPS.map((s) => ({ id: s.id, label: s.label }))} currentIndex={step} vertical={false} />
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        {prefill === 'loaded' ? (
          <Alert variant="info" title="Pre-filled from the owner budget notice">
            The subject and message are the notice you prepared, addressed to owners. Check the audience, read the message, then send it as usual. Nothing has been sent.
          </Alert>
        ) : prefill === 'missing' ? (
          <Alert variant="warning" title="The budget notice didn’t come through">
            Go back to the budget, open Prepare owner budget notice and choose Create announcement draft again in this tab.
          </Alert>
        ) : null}
        {/* Step 1 — topic + audience */}
        <div hidden={step !== 0} className="space-y-6">
          <TemplatePicker
            builtIns={BUILT_IN_OPTIONS}
            others={templates}
            value={templateId}
            onChange={pickTemplate}
            disabled={pending}
          />

          <Fieldset legend="Audience" hint="Counts are recipients right now." error={fieldErrors.audience}>
            <AudienceStep
              pending={pending}
              audience={audience}
              setAudience={(k) => {
                setAudience(k)
                setFieldErrors((e) => ({ ...e, audience: '' }))
              }}
              audienceCounts={audienceCounts}
              properties={properties}
              manualContacts={manualContacts}
              draftName={draftName}
              setDraftName={setDraftName}
              draftEmail={draftEmail}
              setDraftEmail={setDraftEmail}
              draftPhone={draftPhone}
              setDraftPhone={setDraftPhone}
              addManualContact={() => {
                const r = addManualContact()
                if (r.ok) setFieldErrors((e) => ({ ...e, audience: '' }))
                return r
              }}
              setError={(m) => setFieldErrors((e) => ({ ...e, audience: m }))}
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
          </Fieldset>
        </div>

        {/* Step 2 — template, declared questions, subject + body */}
        <div hidden={step !== 1} className="space-y-6">
          {/* Declared questions, only when the chosen template has any.
              Answers become the merge bag for its {{ fields }}. */}
          {effectiveQuestions.length > 0 ? (
            <section className="space-y-4 rounded-lg border border-border bg-subtle/50 p-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Details</h3>
                <p className="text-xs text-muted">Your answers are added to the message for you.</p>
              </div>
              <QuestionStep
                questions={effectiveQuestions}
                answers={answers}
                errors={questionErrors}
                onChange={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))}
              />
            </section>
          ) : null}

          <Field
            label="Subject"
            required
            error={fieldErrors.subject}
            hint="Words in {{ double braces }}, like {{ recipient_name }}, are filled in for each person."
          >
            <Input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Welcome to the neighborhood, {{ recipient_name }}"
              disabled={pending}
            />
          </Field>

          {selectedTemplate?.topicSlug ? (
            <SectionToggles
              topicSlug={selectedTemplate.topicSlug}
              answeredKey={answeredKey}
              disabled={pending}
              onRendered={handleSectionsRendered}
            />
          ) : null}

          <Field
            label="Body"
            required
            error={fieldErrors.body}
            hint="Words in {{ double braces }} are filled in for each person."
            labelAside={
              <AiRewriteButton
                value={bodyHtml}
                onChange={setBodyHtml}
                context={`HOA communication, category: ${CATEGORY_LABEL[category]}`}
                disabled={pending}
              />
            }
          >
            <Textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              placeholder="<p>Hi {{ recipient_name }}, ...</p>"
              disabled={pending}
              rows={12}
              className="font-mono text-xs sm:text-xs"
            />
          </Field>

          <SpanishVersion
            subject={subject}
            bodyHtml={bodyHtml}
            value={spanish}
            onChange={(next) => {
              setSpanish(next)
              setFieldErrors((e) => ({ ...e, spanish: '' }))
            }}
            disabled={pending}
            error={fieldErrors.spanish || undefined}
          />
        </div>

        {/* Step 3 — channels, schedule, review */}
        <div hidden={step !== 2} className="space-y-6">
          <Fieldset legend="Channels" error={fieldErrors.channels}>
            <div className="grid gap-3 sm:grid-cols-3">
              {CHANNELS.map((c) => {
                const unavailable = c === 'sms' && !smsConfigured
                return (
                  <Checkbox
                    key={c}
                    checked={!unavailable && channels.includes(c)}
                    onChange={() => {
                      toggleChannel(c)
                      setFieldErrors((e) => ({ ...e, channels: '' }))
                    }}
                    disabled={pending || unavailable}
                    label={CHANNEL_COPY[c].label}
                    description={unavailable ? SMS_NOT_SET_UP : CHANNEL_COPY[c].hint}
                  />
                )
              })}
            </div>
          </Fieldset>

          {officialNoticeOffered ? (
            <Checkbox
              checked={officialNotice}
              onChange={() => setOfficialNotice((v) => !v)}
              disabled={pending}
              label="This is an official notice"
              description="Civ. Code §4040: emailed only to members who agreed to electronic notices. Everyone else needs a paper notice by mail."
            />
          ) : null}

          {SCHEDULING_ENABLED ? (
            <Field
              label="Send at"
              optional
              hint="Leave blank to send now. Uses your local time. It goes out within 5 minutes of the time you pick."
            >
              <Input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                disabled={pending}
                className="sm:max-w-xs"
              />
            </Field>
          ) : (
            <p className="text-sm text-muted">{SCHEDULING_COMING_SOON}</p>
          )}

          <section className="rounded-lg border border-border bg-subtle/50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Review</h3>
            <KeyValueList>
              <KeyValue
                label="Audience"
                value={
                  <span>
                    {AUDIENCE_LABELS[audience]} <span className="num text-muted">({audienceCount})</span>
                  </span>
                }
              />
              <KeyValue label="Subject" value={subject.trim() || null} />
              <KeyValue label="Template" value={selectedTemplate?.name ?? 'Custom message'} />
              <KeyValue label="Languages" value={spanish ? 'English, then Español' : 'English'} />
              <KeyValue
                label="Channels"
                value={channels.map((c) => CHANNEL_COPY[c as (typeof CHANNELS)[number]]?.label ?? c).join(', ') || null}
              />
              <KeyValue
                label="When"
                value={SCHEDULING_ENABLED && scheduledFor ? new Date(scheduledFor).toLocaleString() : 'Immediately'}
              />
            </KeyValueList>
          </section>

          <PreferenceSkips preview={prefPreview} channels={channels} />

          {officialActive ? <PaperNoticeList preview={officialPreview} /> : null}

          {smsEnglishOnly ? <Alert variant="info">{SMS_ENGLISH_ONLY_NOTE}</Alert> : null}
        </div>

        {error ? <Alert variant="error">{error}</Alert> : null}
        {success ? <Alert variant="success">{success}</Alert> : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3 sm:px-6">
        {step > 0 ? (
          <Button type="button" variant="ghost" icon={<ArrowLeft aria-hidden />} onClick={() => goTo(step - 1)} disabled={pending}>
            Back
          </Button>
        ) : (
          <span />
        )}
        {step < lastStep ? (
          <Button type="submit" iconRight={<ArrowRight aria-hidden />}>
            Continue
          </Button>
        ) : (
          <Button
            type="submit"
            loading={pending}
            icon={SCHEDULING_ENABLED && scheduledFor ? <CalendarClock aria-hidden /> : <Send aria-hidden />}
          >
            {SCHEDULING_ENABLED && scheduledFor ? 'Schedule' : 'Send now'}
          </Button>
        )}
      </div>
    </form>
  )
}

/**
 * BL-102 A4: templates first. The built-in library (every HOA has it) as
 * cards, then the HOA's own templates and the community library in one
 * list. Never filtered by a topic.
 */
function TemplatePicker({
  builtIns,
  others,
  value,
  onChange,
  disabled,
}: {
  builtIns: TemplateOption[]
  others: TemplateOption[]
  value: string
  onChange: (id: string) => void
  disabled: boolean
}) {
  const otherSelected = others.some((t) => t.id === value)
  const cards: Array<{ id: string; name: string; description: string }> = [
    ...builtIns.map((t) => ({ id: t.id, name: t.name, description: t.description })),
    { id: '', name: 'Write my own', description: 'Start from a blank message.' },
  ]
  return (
    <Fieldset legend="Start from a template" hint="Pick one and fill in a few details, or write your own.">
      <div className="grid gap-2 sm:grid-cols-2">
        {cards.map((c) => {
          const selected = c.id === '' ? value === '' : value === c.id
          const id = `template-${c.id || 'own'}`
          return (
            <label
              key={id}
              htmlFor={id}
              className={cn(
                'flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors duration-fast',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                selected ? 'border-primary bg-primary-subtle' : 'border-border bg-surface hover:bg-subtle',
                disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
              )}
            >
              <input
                id={id}
                type="radio"
                name="template"
                value={c.id}
                checked={selected}
                onChange={() => onChange(c.id)}
                disabled={disabled}
                className="mt-1 size-4 shrink-0 accent-primary"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{c.name}</span>
                <span className="block text-xs text-muted">{c.description}</span>
              </span>
            </label>
          )
        })}
      </div>
      {others.length > 0 ? (
        <div className="mt-3">
          <Field label="More templates" optional hint="Your HOA’s own templates and the community library.">
            <Select
              value={otherSelected ? value : ''}
              onValueChange={(v) => onChange(v)}
              disabled={disabled}
              placeholder="Choose another template"
            >
              <option value="">Choose another template</option>
              {others.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : null}
    </Fieldset>
  )
}

/** BL-102 Review step: "N will be skipped (opted out)", per channel. */
function PreferenceSkips({ preview, channels }: { preview: PreferencePreview | null; channels: string[] }) {
  if (!preview) return null
  if (!preview.ok) return <Alert variant="warning">{preview.error}</Alert>
  const lines: string[] = []
  if (channels.includes('email') && preview.email > 0) {
    lines.push(`Email: ${preview.email} will be skipped (opted out).`)
  }
  if (channels.includes('sms') && preview.sms > 0) {
    lines.push(`Text: ${preview.sms} will be skipped (opted out, or never opted in to texts).`)
  }
  if (lines.length === 0) return null
  return (
    <Alert variant="info" title="Some people won’t get every channel">
      {lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
      <p className="mt-1">They still get the message on any other channel you picked.</p>
    </Alert>
  )
}

/** BL-020 Review step: who needs a paper copy of this official notice. */
function PaperNoticeList({ preview }: { preview: OfficialNoticePreview | null }) {
  if (!preview) return <p className="text-sm text-muted">Checking e-consent…</p>
  if (!preview.ok) return <Alert variant="error">{preview.error}</Alert>
  if (!preview.applies) return null
  const { paper } = preview
  if (paper.count === 0) {
    return (
      <Alert variant="success">
        All {preview.recipients} recipients agreed to electronic notices. No paper notices needed.
      </Alert>
    )
  }
  return (
    <Alert variant="warning" title={paperNoticeLabel(paper.count)}>
      <p>
        They haven’t agreed to electronic notices, or have no email on file, so they won’t get this by email.
        Mail each of them a paper copy.
      </p>
      <ul className="mt-2 max-h-60 list-disc space-y-0.5 overflow-y-auto pl-5">
        {paper.recipients.map((r, i) => (
          <li key={i}>
            {r.name} <span className="text-muted">· {r.home}</span>
          </li>
        ))}
      </ul>
    </Alert>
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
