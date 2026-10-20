'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
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
import { htmlToMessageText } from '@/lib/communications/plain-text'
import { proposalToWizardFields, type WizardFieldsFromProposal } from '@/lib/communications/proposal-to-wizard'
import type { CommProposal } from '@homeowner-portal/workflows/W31-propose'
import { PlainEditor } from '@/components/ui/PlainEditor'
import {
  categoryForUrgency,
  channelsSentence,
  pickChannels,
  urgencyForCategory,
  type Urgency,
} from '@/lib/communications/channel-defaults'
import { streetAudienceLabel, type StreetOption } from '@/lib/communications/streets'
import type { FollowUpDraft } from '@/lib/communications/follow-up'
import { DRAFT_STATE_VERSION, UNTITLED_DRAFT, draftHref, isDraftEmpty, type ComposerDraftState } from '@/lib/communications/drafts'
import { trackEvent } from '@/lib/analytics/track'
import { deleteDraft, saveDraft } from '@/lib/communications/draft-actions'
import { DraftStatus, type DraftSaveState } from './DraftStatus'
import { DeleteDraftButton } from '../DeleteDraftButton'
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
import { ComposeBox } from './ComposeBox'
import { QuestionStep } from './QuestionStep'
import { SectionToggles } from './SectionToggles'
import { SpanishVersion, type SpanishDraft } from './SpanishVersion'
import { PhonePreview } from './PhonePreview'
import { NoticeLawAlert } from '@/components/meetings/NoticeLawAlert'
import type { NoticeCheck } from '@/lib/meetings/notice-law'
import { calendarParagraphHtml, type MeetingNoticePrefill } from '@/lib/meetings/notice-prefill'
import { meetingCalendarParagraph, recordMeetingNoticeSent } from '@/lib/meetings/notice-actions'
import { appOrigin } from '@/lib/app-origin'

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

/** BL-102 A9: how long typing pauses before the draft saves. */
const AUTOSAVE_DELAY_MS = 1500

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
  streets = [],
  followUp: followUpProp = null,
  resumeDraft = null,
  meetingNotice: meetingNoticeProp = null,
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
  /** BL-102 A5: the HOA's streets, parsed from its addresses. */
  streets?: StreetOption[]
  /**
   * BL-102 A8: `?followUp=<id>&via=email|text` from a results page. Fills
   * the composer for the homes that haven't opened; the board still
   * reviews, previews and presses Send.
   */
  followUp?: FollowUpDraft | null
  /**
   * BL-102 A9: `?draft=<id>` — an autosaved draft to resume. Every field
   * starts from it; nothing is sent until the board presses Send.
   */
  resumeDraft?: { id: string; state: ComposerDraftState } | null
  /**
   * BL-118: `?meeting=<id>` — a notice for a scheduled meeting. Opens on
   * the built-in Meeting notice template, answered from the meeting, to
   * all owners. The send links the message to the meeting and adds an
   * add-to-calendar link; nothing goes out until the board presses Send.
   */
  meetingNotice?: { prefill: MeetingNoticePrefill; check: NoticeCheck | null } | null
}) {
  const r = resumeDraft?.state ?? null
  // BL-118: a fresh meeting notice (a resumed draft carries its own link).
  const meetingPrefill = r ? null : (meetingNoticeProp?.prefill ?? null)
  const meetingNoticeId = r?.meetingNotice?.meetingId ?? meetingPrefill?.meetingId ?? null
  const meetingTemplate = meetingPrefill ? BUILT_IN_OPTIONS.find((t) => t.id === meetingPrefill.templateId) ?? null : null
  // A resumed follow-up draft carries its own follow-up audience.
  const followUp: FollowUpDraft | null = followUpProp ?? r?.followUp ?? null
  const preselect = initialPropertyId && properties.some((p) => p.id === initialPropertyId) ? initialPropertyId : null
  const router = useRouter()
  // BL-102 A4: no Topic step. A template brings its own category; a
  // message written from scratch is filed as an announcement (or, from the
  // budget notice, as financial).
  const [baseCategory, setBaseCategory] = useState<(typeof CATEGORIES)[number]>(r?.baseCategory ?? (meetingPrefill ? meetingPrefill.baseCategory : 'announcement'))
  const [audience, setAudience] = useState<AudienceKind>(
    r ? r.audience : followUp ? 'follow_up' : preselect ? 'specific_property' : meetingPrefill ? meetingPrefill.audience : 'everyone',
  )
  const [templateId, setTemplateId] = useState<string>(r?.templateId ?? (meetingTemplate ? meetingTemplate.id : ''))
  const [answers, setAnswers] = useState<AnswerMap>(r?.answers ?? (meetingTemplate ? { ...meetingPrefill?.answers } : {}))
  const [subject, setSubject] = useState(r?.subject ?? followUp?.subject ?? meetingTemplate?.subject ?? '')
  const [bodyHtml, setBodyHtml] = useState(r?.bodyHtml ?? followUp?.bodyHtml ?? meetingTemplate?.bodyHtml ?? '')
  // A follow-up goes only on the channel the board asked for: the original
  // is already in everyone's portal.
  const [channels, setChannels] = useState<string[]>(
    r ? r.channels : followUp ? [followUp.via === 'text' ? 'sms' : 'email'] : ['email', 'portal'],
  )
  // BL-102 A6: urgency drives the channels until the board picks channels
  // by hand; after that nothing overwrites their choice.
  const [urgency, setUrgency] = useState<Urgency>(r?.urgency ?? 'routine')
  const [channelsTouched, setChannelsTouched] = useState(r ? r.channelsTouched : followUp !== null)
  // BL-102 A5: the street audience.
  const [selectedStreetKey, setSelectedStreetKey] = useState(r?.selectedStreetKey ?? '')
  const [streetOwnersOnly, setStreetOwnersOnly] = useState(r?.streetOwnersOnly ?? false)
  const selectedStreet = streets.find((st) => st.key === selectedStreetKey) ?? null
  const [scheduledFor, setScheduledFor] = useState(r?.scheduledFor ?? '')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [step, setStep] = useState(r ? r.step : followUp ? 1 : 0)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  // BL-025: the optional, board-reviewed Spanish version.
  const [spanish, setSpanish] = useState<SpanishDraft | null>(r?.spanish ?? null)
  // BL-020: official notice (CA Civ. Code §4040) and its Review-step preview.
  const [officialNotice, setOfficialNotice] = useState(r?.officialNotice ?? false)
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
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(r?.selectedPropertyId ?? preselect ?? '')
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
  const [manualContacts, setManualContacts] = useState<ManualContact[]>(r?.manualContacts ?? [])
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

  // BL-102 A9: picks a resumed draft restores once, after the list loads.
  const restoreResidentIds = useRef<string[] | null>(r?.audience === 'specific_property' ? r.checkedResidentIds : null)
  const restoreBoardIds = useRef<string[] | null>(r?.audience === 'board' ? r.checkedBoardIds : null)

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
        // A resumed draft keeps the residents it had ticked (once).
        const restore = restoreResidentIds.current
        restoreResidentIds.current = null
        setCheckedResidentIds(
          new Set(restore ? rows.filter((x) => restore.includes(x.id)).map((x) => x.id) : rows.map((x) => x.id)),
        )
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
        // unchecked, so they're opt-in per send. A resumed draft keeps
        // its own picks (once).
        const restore = restoreBoardIds.current
        restoreBoardIds.current = null
        setCheckedBoardIds(
          new Set(
            restore
              ? rows.filter((x) => restore.includes(x.userId)).map((x) => x.userId)
              : rows.filter((x) => x.role === 'board').map((x) => x.userId),
          ),
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

  // BL-102 A2: what the one-box draft wants the board to check, shown on
  // the Message step until the board dismisses it or picks a template.
  const [draftReview, setDraftReview] = useState<WizardFieldsFromProposal['review'] | null>(null)

  /** Fill the wizard from the AI proposal. Fills only; the board reviews
   *  every step and nothing is sent until they press Send. */
  function applyProposal(proposal: CommProposal) {
    setEdited(true)
    const f = proposalToWizardFields(proposal, { smsConfigured, schedulingEnabled: SCHEDULING_ENABLED, streets })
    setTemplateId('')
    setBaseCategory(f.category)
    setAudience(f.audience)
    if (f.street) {
      setSelectedStreetKey(f.street.key)
      setStreetOwnersOnly(f.street.ownersOnly)
    }
    setSubject(f.subject)
    setBodyHtml(f.bodyHtml)
    setUrgency(f.urgency)
    setChannels(f.channels)
    setChannelsTouched(false)
    setScheduledFor(f.scheduledFor)
    // A Spanish version of an earlier body would no longer match it.
    setSpanish(null)
    setDraftReview(f.review)
    setFieldErrors({})
    setError(null)
    setStep(1)
    requestAnimationFrame(() => document.getElementById('wizard-top')?.scrollIntoView({ block: 'nearest' }))
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
  // A meeting notice's prefilled answers are kept on mount the same way.
  const keepResumedAnswers = useRef(r !== null || meetingTemplate !== null)
  useEffect(() => {
    setActiveQuestions(null)
    // A resumed draft's answers belong to its template: keep them on mount.
    if (keepResumedAnswers.current) {
      keepResumedAnswers.current = false
      return
    }
    setAnswers({})
  }, [templateId])

  // Questions still referenced by an included section. null means "no
  // section filtering in play" — either a non-community template or the
  // toggles have not reported yet — in which case the template's full list
  // applies, which is the pre-sections behaviour.
  const [activeQuestions, setActiveQuestions] = useState<readonly TemplateQuestion[] | null>(null)

  function pickTemplate(id: string) {
    setEdited(true)
    // A newly picked template takes its own sections' body.
    keepResumedBody.current = false
    setTemplateId(id)
    setDraftReview(null)
    const t = allTemplates.find((x) => x.id === id)
    if (t) {
      setSubject(t.subject)
      setBodyHtml(t.bodyHtml)
      // BL-102 A6: the template's category sets urgency, and urgency the
      // channels — unless the board already chose channels by hand, which
      // a template pick never silently overwrites.
      const nextUrgency = urgencyForCategory(t.category)
      setUrgency(nextUrgency)
      setChannels(
        pickChannels({
          urgency: nextUrgency,
          smsConfigured,
          current: channels,
          touched: channelsTouched,
          templateChannels: t.channels,
        }).channels,
      )
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

  const keepResumedBody = useRef(r !== null)
  // useCallback so SectionToggles' effect, which intentionally omits this
  // from its dep list, is nonetheless given a stable identity.
  const handleSectionsRendered = useCallback(
    (rendered: { bodyHtml: string; questions: readonly TemplateQuestion[] }) => {
      // A resumed draft keeps its saved body: the toggles' first render
      // would otherwise replace it with the template's default sections.
      if (keepResumedBody.current) keepResumedBody.current = false
      else setBodyHtml(rendered.bodyHtml)
      setActiveQuestions(rendered.questions)
    },
    [],
  )

  /** BL-102 A6: "Is this urgent?" — re-picks the channels unless the
   *  board already chose them by hand. */
  function changeUrgency(next: Urgency) {
    setUrgency(next)
    setChannels(pickChannels({ urgency: next, smsConfigured, current: channels, touched: channelsTouched }).channels)
  }

  function toggleChannel(c: string) {
    setChannelsTouched(true)
    setChannels((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    )
  }

  /** Per-step checks, shown beside the field they concern. */
  function errorsForStep(i: number): FieldErrors {
    const errs: FieldErrors = {}
    if (i === 0) {
      if (audience === 'street') {
        if (!selectedStreet) errs.audience = 'Pick a street first.'
      } else if (audience === 'specific_property') {
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
    if (audience === 'follow_up') {
      if (!followUp) return { ok: false, error: 'This follow-up is no longer available. Pick an audience.' }
      audienceDef = {
        kind: 'specific_units',
        unitIds: followUp.unitIds,
        ...(followUp.ownersOnly ? { ownersOnly: true } : {}),
        extra: { summary: 'Follow-up to homes that hadn’t opened' },
      }
    } else if (audience === 'street') {
      if (!selectedStreet) return { ok: false, error: 'Pick a street first.' }
      // BL-102 A5: the street's homes, through the existing unit-list
      // audience. The street name is only for the summary.
      audienceDef = {
        kind: 'specific_units',
        unitIds: selectedStreet.unitIds,
        street: selectedStreet.label,
        ...(streetOwnersOnly ? { ownersOnly: true } : {}),
      }
    } else if (audience === 'specific_property') {
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

  // BL-102 A6: an urgent message is filed as an emergency (there is no
  // urgency column until Phase B); turning urgency off files an emergency
  // template as a plain announcement.
  const sendCategory = categoryForUrgency(category, urgency) as (typeof CATEGORIES)[number]

  /** The template answers as the send's extraFields, or undefined when a
   *  required one is blank (the preview then shows it as a blank). */
  function previewExtraFields(): Record<string, string | number | null> | undefined {
    if (!effectiveQuestions.length) return undefined
    try {
      return buildMergeBag(effectiveQuestions, answers, {}) as Record<string, string | number | null>
    } catch {
      return undefined
    }
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
  }, [officialActive, audience, selectedPropertyId, selectedStreetKey, streetOwnersOnly, checkedResidentIds, checkedBoardIds, boardMembers, manualContacts, channels])

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
  }, [reviewing, audience, selectedPropertyId, selectedStreetKey, streetOwnersOnly, checkedResidentIds, checkedBoardIds, boardMembers, manualContacts, channels, officialNotice])

  // ─── BL-102 A9: autosave to a status='draft' row ───────────────────────
  // Saves only after the board changes something (opening a follow-up or
  // the budget notice creates nothing), debounced, one save at a time. A
  // draft never sends: the real send inserts its own message, then this
  // draft is deleted.
  const draftState: ComposerDraftState = {
    v: DRAFT_STATE_VERSION,
    step,
    templateId,
    baseCategory,
    audience,
    selectedPropertyId,
    checkedResidentIds: Array.from(checkedResidentIds),
    checkedBoardIds: Array.from(checkedBoardIds),
    manualContacts,
    selectedStreetKey,
    streetOwnersOnly,
    answers: Object.fromEntries(
      Object.entries(answers).filter((e): e is [string, string | string[]] => e[1] !== undefined),
    ),
    subject,
    bodyHtml,
    channels,
    urgency,
    channelsTouched,
    scheduledFor,
    spanish,
    officialNotice,
    followUp: audience === 'follow_up' ? followUp : null,
    meetingNotice: meetingNoticeId ? { meetingId: meetingNoticeId } : null,
  }
  const draftJson = JSON.stringify(draftState)
  const draftEmpty = isDraftEmpty(draftState)
  const [draftId, setDraftId] = useState<string | null>(resumeDraft?.id ?? null)
  const [saveState, setSaveState] = useState<DraftSaveState>(resumeDraft ? { kind: 'resumed' } : { kind: 'idle' })
  const [edited, setEdited] = useState(false)
  const draftIdRef = useRef<string | null>(resumeDraft?.id ?? null)
  const lastSavedJson = useRef<string>(draftJson)
  const latestJson = useRef(draftJson)
  latestJson.current = draftJson
  const sendingRef = useRef(false)
  const goneRef = useRef(false)
  const inFlight = useRef<Promise<void> | null>(null)
  const queuedJson = useRef<string | null>(null)

  async function persistDraft(json: string): Promise<void> {
    if (sendingRef.current || goneRef.current) return
    if (inFlight.current) {
      queuedJson.current = json
      return
    }
    const run = (async () => {
      setSaveState({ kind: 'saving' })
      let res: Awaited<ReturnType<typeof saveDraft>>
      try {
        res = await saveDraft({ id: draftIdRef.current, state: JSON.parse(json) as unknown })
      } catch {
        res = { ok: false, error: 'The draft couldn’t be saved. Check your connection.' }
      }
      if (res.ok) {
        const isNew = draftIdRef.current === null
        draftIdRef.current = res.id
        setDraftId(res.id)
        lastSavedJson.current = json
        setSaveState({ kind: 'saved', at: Date.now() })
        // A reload (or a closed tab reopened from history) resumes the draft.
        if (isNew && !sendingRef.current) window.history.replaceState(window.history.state, '', draftHref(res.id))
      } else if (res.gone) {
        goneRef.current = true
        setSaveState({ kind: 'gone' })
      } else {
        setSaveState({ kind: 'error', message: res.error })
      }
    })()
    inFlight.current = run
    await run
    inFlight.current = null
    const next = queuedJson.current
    queuedJson.current = null
    if (next !== null && next !== lastSavedJson.current) await persistDraft(next)
  }

  useEffect(() => {
    if (!edited || pending || sendingRef.current || goneRef.current) return
    if (draftJson === lastSavedJson.current) return
    if (draftIdRef.current === null && draftEmpty) return
    const t = window.setTimeout(() => void persistDraft(draftJson), AUTOSAVE_DELAY_MS)
    return () => window.clearTimeout(t)
    // persistDraft reads only refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftJson, draftEmpty, edited, pending])

  // Leaving the tab saves at once rather than waiting out the debounce.
  useEffect(() => {
    if (!edited) return
    const flush = () => {
      if (document.visibilityState !== 'hidden') return
      const json = latestJson.current
      if (json === lastSavedJson.current || sendingRef.current || goneRef.current) return
      if (draftIdRef.current === null && isDraftEmpty(JSON.parse(json) as ComposerDraftState)) return
      void persistDraft(json)
    }
    document.addEventListener('visibilitychange', flush)
    return () => document.removeEventListener('visibilitychange', flush)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edited])

  /** After a successful send: the draft has become a real message. */
  async function retireDraft() {
    if (inFlight.current) await inFlight.current
    const id = draftIdRef.current
    if (!id) return
    try {
      await deleteDraft(id)
    } catch {
      // Left in Drafts; the board can delete it there. Never blocks the send.
    }
  }

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

    // No autosave from here on: a save racing the send could revive the draft.
    sendingRef.current = true
    startTransition(async () => {
      // BL-118: a meeting notice gets the calendar invite and agenda links
      // under the board's message. L-3: the server builds the paragraph so
      // the link's time and place are signed; if that fails, the link
      // carries the date only.
      let finalBodyHtml = bodyHtml
      if (meetingNoticeId) {
        const cal = await meetingCalendarParagraph(meetingNoticeId, {
          time: answers.meeting_time,
          where: answers.meeting_location,
        }).catch(() => null)
        finalBodyHtml = `${bodyHtml}\n${cal?.ok ? cal.html : calendarParagraphHtml(appOrigin(), meetingNoticeId, {})}`
      }
      const sent = sendCommunication({
        category: sendCategory,
        subject: finalSubject,
        bodyHtml: finalBodyHtml,
        // BL-102 A3: keeps bullets and link addresses, SMS-safe punctuation.
        bodyText: htmlToMessageText(finalBodyHtml),
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
        // BL-102 A8: a follow-up is a new message linked to the original.
        ...(followUp && audience === 'follow_up'
          ? { relatedResource: { type: 'follow_up', id: followUp.originalId } }
          : meetingNoticeId
            ? { relatedResource: { type: 'meeting', id: meetingNoticeId } }
            : {}),
      }).catch(() => ({ ok: false as const, error: 'We couldn’t confirm the send. Check Communications to see whether it went out before trying again.' }))
      const result = await sent
      if (!result.ok) {
        sendingRef.current = false
        setError(result.error)
        return
      }
      const sentChannels = channels.filter((c) => c !== 'sms' || smsConfigured)
      trackEvent('communication.sent', {
        scheduled: scheduledAt !== null,
        channelCount: Math.min(4, Math.max(1, sentChannels.length)),
        sms: sentChannels.includes('sms'),
      })
      await retireDraft()
      // BL-118: the communication is the record; notice_posted_at is
      // filled too only once M1 is applied (server-side check). Never
      // blocks the send's success.
      if (meetingNoticeId && !scheduledAt) {
        await recordMeetingNoticeSent(meetingNoticeId, result.communicationId).catch(() => null)
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

  const audienceLabel =
    audience === 'street' && selectedStreet
      ? streetAudienceLabel(selectedStreet.label, streetOwnersOnly)
      : AUDIENCE_LABELS[audience]

  const audienceCount =
    audience === 'follow_up'
      ? (followUp?.unitIds.length ?? 0)
      : audience === 'street'
      ? selectedStreet
        ? streetOwnersOnly
          ? selectedStreet.ownerCount
          : selectedStreet.unitIds.length
        : 0
      : audience === 'specific_property'
      ? checkedResidentIds.size
      : audience === 'board'
        ? checkedBoardIds.size
        : audience === 'manual_emails'
          ? manualContacts.length
          : audienceCounts[audience]

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col"
      // BL-102 A9: the first real edit turns autosave on.
      onInputCapture={() => setEdited(true)}
      onChangeCapture={() => setEdited(true)}
    >
      <div id="wizard-top" className="scroll-mt-24 border-b border-border p-5 sm:px-6">
        <WizardStepper steps={STEPS.map((s) => ({ id: s.id, label: s.label }))} currentIndex={step} vertical={false} />
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        {followUp ? (
          <Alert variant="info" title="Follow-up: nothing has been sent">
            <p>
              This goes to the {followUp.unitIds.length} {followUp.unitIds.length === 1 ? 'home' : 'homes'} that haven’t
              opened the earlier email, by {followUp.via === 'text' ? 'text' : 'email'}. Check the message and the
              preview, then press Send.
            </p>
            {followUp.missing.length > 0 ? (
              <p className="mt-1">
                Fill in {followUp.missing.join(', ')}: the answers to the original’s questions aren’t stored.
              </p>
            ) : null}
            {followUp.spanishDropped ? (
              <p className="mt-1">The Spanish version isn’t copied. Add it again below if you want it.</p>
            ) : null}
          </Alert>
        ) : null}
        {meetingNoticeId ? (
          <Alert variant="info" title="Meeting notice: nothing has been sent">
            <p>
              Addressed to all owners. Enter the start time and the place on the Message step. A link to add the
              meeting to a calendar, and one to the agenda in the resident portal, go under your message.
            </p>
          </Alert>
        ) : null}
        {meetingNoticeProp?.check && meetingPrefill ? <NoticeLawAlert check={meetingNoticeProp.check} /> : null}
        {resumeDraft ? (
          <Alert variant="info" title="Your draft: nothing has been sent">
            Pick up where you left off. Changes save automatically, and nothing goes out until you press Send.
          </Alert>
        ) : null}
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
          <ComposeBox onProposal={applyProposal} disabled={pending} />

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
              followUpCount={followUp?.unitIds.length ?? 0}
              streets={streets}
              selectedStreetKey={selectedStreetKey}
              setSelectedStreetKey={(k) => {
                setSelectedStreetKey(k)
                setFieldErrors((e) => ({ ...e, audience: '' }))
              }}
              streetOwnersOnly={streetOwnersOnly}
              setStreetOwnersOnly={setStreetOwnersOnly}
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
          {draftReview ? (
            <DraftReview
              review={draftReview}
              audienceLabel={audienceLabel}
              suggestedTemplateName={
                draftReview.suggestedTemplateId
                  ? (BUILT_IN_OPTIONS.find((t) => t.id === draftReview.suggestedTemplateId)?.name ?? null)
                  : null
              }
              onUseTemplate={() => {
                if (draftReview.suggestedTemplateId) pickTemplate(draftReview.suggestedTemplateId)
              }}
              onDismiss={() => setDraftReview(null)}
              disabled={pending}
            />
          ) : null}

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
            // BL-102 A9: section choices are an advanced option. The
            // toggles stay mounted while closed, so the body still follows
            // the template's default sections.
            <details className="rounded-lg border border-border px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-primary">
                More options: choose this template’s sections
              </summary>
              <div className="mt-3">
                <SectionToggles
                  topicSlug={selectedTemplate.topicSlug}
                  answeredKey={answeredKey}
                  disabled={pending}
                  onRendered={handleSectionsRendered}
                />
              </div>
            </details>
          ) : null}

          <Field
            label="Body"
            required
            error={fieldErrors.body}
            hint="[Resident's name] and [HOA name] are filled in for each person."
          >
            <PlainEditor
              html={bodyHtml}
              onChange={setBodyHtml}
              disabled={pending}
              invalid={Boolean(fieldErrors.body)}
              aside={(text, setText) => (
                <AiRewriteButton
                  value={text}
                  onChange={setText}
                  context={`HOA communication, category: ${CATEGORY_LABEL[category]}`}
                  disabled={pending}
                />
              )}
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
          {/* BL-102 A6: one question drives the channels. */}
          <Fieldset legend="How should it go out?" error={fieldErrors.channels}>
            <div className="space-y-3">
              <Checkbox
                checked={urgency === 'urgent'}
                onChange={() => changeUrgency(urgency === 'urgent' ? 'routine' : 'urgent')}
                disabled={pending}
                label="This is urgent"
                description={
                  smsConfigured
                    ? 'Urgent messages also go by text, to residents who agreed to get texts.'
                    : 'Urgent messages would also go by text, but texting isn’t set up yet, so this goes by email and the portal.'
                }
              />
              <p className="text-sm text-foreground-secondary">
                Going by: <strong>{channelsSentence(channels.filter((c) => c !== 'sms' || smsConfigured))}</strong>
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {MAIN_CHANNELS.map((c) => (
                  <ChannelBox
                    key={c}
                    channel={c}
                    channels={channels}
                    smsConfigured={smsConfigured}
                    disabled={pending}
                    onToggle={() => {
                      toggleChannel(c)
                      setFieldErrors((e) => ({ ...e, channels: '' }))
                    }}
                  />
                ))}
              </div>
              {channels.includes('sms') && smsConfigured && prefPreview?.ok ? (
                <p className="text-xs text-muted">
                  {prefPreview.smsReach} of {prefPreview.recipients}{' '}
                  {prefPreview.recipients === 1 ? 'recipient gets' : 'recipients get'} a text (a mobile number on file
                  and agreed to texts). Everyone else still gets email and the portal.
                </p>
              ) : null}
            </div>
          </Fieldset>

          {/* BL-102 A9: the rarely needed settings, out of the way. */}
          <details className="rounded-lg border border-border px-4 py-3" open={officialNotice || !channels.includes('portal') || undefined}>
            <summary className="cursor-pointer text-sm font-medium text-primary">More options</summary>
            <div className="mt-3 space-y-3">
              <ChannelBox
                channel="portal"
                channels={channels}
                smsConfigured={smsConfigured}
                disabled={pending}
                onToggle={() => {
                  toggleChannel('portal')
                  setFieldErrors((e) => ({ ...e, channels: '' }))
                }}
              />
              {officialNoticeOffered ? (
                <Checkbox
                  checked={officialNotice}
                  onChange={() => setOfficialNotice((v) => !v)}
                  disabled={pending}
                  label="This is an official notice"
                  description="Civ. Code §4040: emailed only to members who agreed to electronic notices. Everyone else needs a paper notice by mail."
                />
              ) : null}
            </div>
          </details>

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
                    {audienceLabel} <span className="num text-muted">({audienceCount})</span>
                  </span>
                }
              />
              <KeyValue label="Subject" value={subject.trim() || null} />
              <KeyValue label="Template" value={selectedTemplate?.name ?? 'Custom message'} />
              <KeyValue label="Languages" value={spanish ? 'English, then Español' : 'English'} />
              <KeyValue
                label="Going by"
                value={channelsSentence(channels.filter((c) => c !== 'sms' || smsConfigured))}
              />
              <KeyValue
                label="When"
                value={SCHEDULING_ENABLED && scheduledFor ? new Date(scheduledFor).toLocaleString() : 'Immediately'}
              />
            </KeyValueList>
          </section>

          {reviewing ? (
            <PhonePreview
              audience={(() => {
                const built = buildAudienceDef()
                return built.ok ? built.def : null
              })()}
              subject={subject.trim()}
              bodyHtml={bodyHtml}
              extraFields={previewExtraFields()}
              spanish={spanish ? { subject: spanish.subject.trim(), bodyHtml: spanish.bodyHtml } : null}
              showText={channels.includes('sms') && smsConfigured}
              showPortal={channels.includes('portal')}
              disabled={pending}
            />
          ) : null}

          <PreferenceSkips preview={prefPreview} channels={channels} />

          {officialActive ? <PaperNoticeList preview={officialPreview} /> : null}

          {smsEnglishOnly ? <Alert variant="info">{SMS_ENGLISH_ONLY_NOTE}</Alert> : null}
        </div>

        {error ? <Alert variant="error">{error}</Alert> : null}
        {success ? <Alert variant="success">{success}</Alert> : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {step > 0 ? (
            <Button type="button" variant="ghost" icon={<ArrowLeft aria-hidden />} onClick={() => goTo(step - 1)} disabled={pending}>
              Back
            </Button>
          ) : null}
          {draftId ? (
            <DeleteDraftButton
              draftId={draftId}
              title={subject.trim() || UNTITLED_DRAFT}
              size="xs"
              disabled={pending}
              onDeleted={() => {
                goneRef.current = true
              }}
            />
          ) : null}
          <DraftStatus state={saveState} />
        </div>
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

const MAIN_CHANNELS = ['email', 'sms'] as const

/** One channel's tick box; the Text box explains when texting isn't set up. */
function ChannelBox({
  channel,
  channels,
  smsConfigured,
  disabled,
  onToggle,
}: {
  channel: (typeof CHANNELS)[number]
  channels: string[]
  smsConfigured: boolean
  disabled: boolean
  onToggle: () => void
}) {
  const unavailable = channel === 'sms' && !smsConfigured
  return (
    <Checkbox
      checked={!unavailable && channels.includes(channel)}
      onChange={onToggle}
      disabled={disabled || unavailable}
      label={CHANNEL_COPY[channel].label}
      description={unavailable ? SMS_NOT_SET_UP : CHANNEL_COPY[channel].hint}
    />
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

/** BL-102 A2: what the AI draft could not know, shown above the message. */
function DraftReview({
  review,
  audienceLabel,
  suggestedTemplateName,
  onUseTemplate,
  onDismiss,
  disabled,
}: {
  review: WizardFieldsFromProposal['review']
  audienceLabel: string
  suggestedTemplateName: string | null
  onUseTemplate: () => void
  onDismiss: () => void
  disabled: boolean
}) {
  return (
    <Alert variant="info" title="Drafted for you. Check it before sending.">
      <p>
        Going to: <strong>{audienceLabel}</strong>. {review.why}
      </p>
      {review.street ? (
        <p className="mt-1">
          You mentioned {review.street}, but it isn’t one of the streets in your homes’ addresses (or can’t be combined
          with this audience). Check the audience on the first step: pick “A street” to send to one street.
        </p>
      ) : null}
      {review.missingFacts.length > 0 ? (
        <div className="mt-2">
          <p className="font-medium">Add these if you know them (left out rather than guessed):</p>
          <ul className="list-disc pl-5">
            {review.missingFacts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {review.unverifiedNumbers.length > 0 ? (
        <p className="mt-2">
          <strong>Check these:</strong> {review.unverifiedNumbers.join(', ')}. They are in the draft but not in what
          you wrote.
        </p>
      ) : null}
      {review.droppedSendAt ? (
        <p className="mt-2">You asked to send it later. {SCHEDULING_COMING_SOON} It goes when you press Send.</p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {suggestedTemplateName ? (
          <Button type="button" variant="secondary" size="xs" onClick={onUseTemplate} disabled={disabled}>
            Use the “{suggestedTemplateName}” template instead
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="xs" onClick={onDismiss} disabled={disabled}>
          Got it
        </Button>
      </div>
    </Alert>
  )
}
