'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Car,
  CheckCircle2,
  CloudLightning,
  Dog,
  Flag,
  Ghost,
  Gift,
  GraduationCap,
  Languages,
  Lightbulb,
  Megaphone,
  PartyPopper,
  Sparkles,
  Sprout,
  Sun,
  Tag,
  Trash2,
  Users,
  Utensils,
  Waves,
  type LucideIcon,
} from 'lucide-react'
import { Alert, Button, Field, Input, Textarea } from '@homeowner-portal/ui'
import { responseErrorMessage } from '@/lib/api/client'
import { sendAnnouncement } from '@/lib/announcements/actions'
import {
  CUSTOM_OCCASION_ID,
  EMPTY_FACTS,
  GRID_OCCASIONS,
  fillCustom,
  fillOccasion,
  getOccasion,
  type AnnouncementFacts,
  type Occasion,
  type OccasionIcon,
} from '@/lib/announcements/occasions'
import { parseAnnouncementSentence } from '@/lib/announcements/parse-sentence'
import { htmlToPlainEditorText, plainTextToHtml } from '@/lib/communications/plain-text'
import { htmlToPlainText } from '@/lib/communications/bilingual'
import { localNowString } from '@/lib/communications/proposal-to-wizard'
import { streetSelection, type StreetOption } from '@/lib/communications/streets'
import { PhonePreview } from '../new/PhonePreview'

const ICONS: Record<OccasionIcon, LucideIcon> = {
  ghost: Ghost,
  gift: Gift,
  'party-popper': PartyPopper,
  flag: Flag,
  utensils: Utensils,
  'graduation-cap': GraduationCap,
  car: Car,
  dog: Dog,
  waves: Waves,
  sun: Sun,
  trash: Trash2,
  sprout: Sprout,
  tag: Tag,
  lightbulb: Lightbulb,
  users: Users,
  'cloud-lightning': CloudLightning,
  megaphone: Megaphone,
}

type Step = 'pick' | 'draft' | 'review'
/** Where the words on screen came from. Only an untouched template refills. */
type Source = 'template' | 'ai' | 'edited'

interface SentResult {
  scheduled: boolean
  communicationId: string
  recipientCount: number
  sentCount: number
  failedCount: number
  heldCount: number
}

const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'pick', label: '1. Pick' },
  { id: 'draft', label: '2. Draft' },
  { id: 'review', label: '3. Review and send' },
]

export function AnnouncementFlow({
  associationName,
  today,
  streets,
  everyoneCount,
  smsAvailable,
  schedulingEnabled,
  initialOccasionId,
  initialDate,
}: {
  associationName: string
  today: string
  streets: StreetOption[]
  everyoneCount: number
  smsAvailable: boolean
  schedulingEnabled: boolean
  initialOccasionId: string | null
  initialDate: string
}) {
  const initial = getOccasion(initialOccasionId)
  const initialFacts: AnnouncementFacts = { ...EMPTY_FACTS, date: initialDate }
  const initialFilled = initial ? fillOccasion(initial, associationName, initialFacts) : null

  const [step, setStep] = useState<Step>(initial ? 'draft' : 'pick')
  // The button that moved the user to another step unmounts with the old
  // screen, which drops keyboard focus to <body> and says nothing to a
  // screen reader (WCAG 2.4.3 / 4.1.3). Move focus to the new step's heading.
  const rootRef = useRef<HTMLDivElement>(null)
  const firstStep = useRef(true)
  const [occasionId, setOccasionId] = useState<string>(initial?.id ?? '')
  const [sentence, setSentence] = useState('')
  const [facts, setFacts] = useState<AnnouncementFacts>(initialFacts)
  const [subject, setSubject] = useState(initialFilled?.en.subject ?? '')
  const [body, setBody] = useState(initialFilled?.en.body ?? '')
  const [source, setSourceState] = useState<Source>('template')
  // The async AI reply reads this, not the (possibly stale) state value.
  const sourceRef = useRef<Source>('template')
  function setSource(next: Source) {
    sourceRef.current = next
    setSourceState(next)
  }
  const [templateDraft, setTemplateDraft] = useState<{ subject: string; body: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [polishing, setPolishing] = useState(false)

  const [esOn, setEsOn] = useState(false)
  const [esSubject, setEsSubject] = useState(initialFilled?.es.subject ?? '')
  const [esBody, setEsBody] = useState(initialFilled?.es.body ?? '')
  const [esEdited, setEsEdited] = useState(false)
  const [esLoading, setEsLoading] = useState(false)
  const [esError, setEsError] = useState<string | null>(null)

  const [audienceMode, setAudienceMode] = useState<'all' | 'street'>('all')
  const [streetKey, setStreetKey] = useState(streets[0]?.key ?? '')
  const [ownersOnly, setOwnersOnly] = useState(false)
  const [includeText, setIncludeText] = useState(initial?.urgent ?? false)
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [scheduledLocal, setScheduledLocal] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [sending, startSend] = useTransition()
  const [sent, setSent] = useState<SentResult | null>(null)
  const isSent = sent !== null
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false
      return
    }
    rootRef.current?.querySelector<HTMLElement>('[data-step-heading]')?.focus()
  }, [step, isSent])

  const occasion: Occasion | null = getOccasion(occasionId)
  const isCustom = occasionId === CUSTOM_OCCASION_ID
  const street = streets.find((s) => s.key === streetKey) ?? null

  // ── Drafting ────────────────────────────────────────────────────────

  function applyTemplate(occ: Occasion | null, f: AnnouncementFacts, typed: string) {
    if (occ) {
      const filled = fillOccasion(occ, associationName, f)
      setSubject(filled.en.subject)
      setBody(filled.en.body)
      if (!esEdited) {
        setEsSubject(filled.es.subject)
        setEsBody(filled.es.body)
      }
    } else {
      const filled = fillCustom(typed, associationName, f)
      setSubject(filled.subject)
      setBody(filled.body)
    }
  }

  function pickOccasion(occ: Occasion) {
    setOccasionId(occ.id)
    setFacts(EMPTY_FACTS)
    setSource('template')
    setTemplateDraft(null)
    setNotice(null)
    setEsOn(false)
    setEsEdited(false)
    setEsError(null)
    setIncludeText(occ.urgent)
    setError(null)
    applyTemplate(occ, EMPTY_FACTS, '')
    setStep('draft')
  }

  function submitSentence() {
    const text = sentence.trim()
    if (text.length < 3) {
      setError('Write a short sentence first, or pick one of the cards above.')
      return
    }
    setError(null)
    const parsed = parseAnnouncementSentence(text, today)
    const f: AnnouncementFacts = { date: parsed.date, time: parsed.time, place: parsed.place, detail: '' }
    const matched = getOccasion(parsed.occasionId)
    setFacts(f)
    setSource('template')
    setTemplateDraft(null)
    setNotice(null)
    setEsOn(false)
    setEsEdited(false)
    setEsError(null)
    if (matched) {
      // A known occasion: the ready template, filled from the sentence.
      setOccasionId(matched.id)
      setIncludeText(matched.urgent)
      applyTemplate(matched, f, text)
      setStep('draft')
      return
    }
    // Anything else: the sentence as a plain draft right away, then the
    // AI polishes it. The plain draft stays if the AI is unavailable.
    setOccasionId(CUSTOM_OCCASION_ID)
    setIncludeText(false)
    const filled = fillCustom(text, associationName, f)
    setSubject(filled.subject)
    setBody(filled.body)
    setTemplateDraft(filled)
    setStep('draft')
    void polish(text, f, filled)
  }

  async function polish(text: string, f: AnnouncementFacts, plain: { subject: string; body: string }) {
    setPolishing(true)
    try {
      const factsLine = [f.date && `Date: ${f.date}`, f.time && `Time: ${f.time}`, f.place && `Place: ${f.place}`]
        .filter(Boolean)
        .join('. ')
      const res = await fetch('/api/ai/compose-communication', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: `${text}${factsLine ? ` (${factsLine})` : ''}`.slice(0, 1000), localNow: localNowString() }),
      })
      if (!res.ok) {
        setNotice('We kept the simple version. You can edit it below.')
        return
      }
      const data = (await res.json().catch(() => null)) as {
        proposal?: { subject?: string; body?: string; unverifiedNumbers?: string[] }
      } | null
      const p = data?.proposal
      if (!p || typeof p.subject !== 'string' || typeof p.body !== 'string') {
        setNotice('We kept the simple version. You can edit it below.')
        return
      }
      if ((p.unverifiedNumbers ?? []).length > 0) {
        setNotice('The AI wording had a time or number you did not give, so we kept the simple version.')
        return
      }
      const aiBody = p.body
        .replace(/\{\{\s*recipient_name\s*\}\}/g, 'neighbor')
        .replace(/\{\{\s*association_name\s*\}\}/g, associationName)
        .replace(/\{\{[^}]*\}\}/g, '')
      // Only replace words the board has not touched.
      if (sourceRef.current === 'template') {
        setSubject(p.subject.slice(0, 120))
        setBody(aiBody)
        setSource('ai')
        setNotice('The AI polished your wording. Read it, then edit anything you like.')
      }
      setTemplateDraft(plain)
    } catch {
      setNotice('We kept the simple version. You can edit it below.')
    } finally {
      setPolishing(false)
    }
  }

  function changeFact(key: keyof AnnouncementFacts, value: string) {
    const next = { ...facts, [key]: value }
    setFacts(next)
    if (source === 'template') applyTemplate(occasion, next, sentence)
    else if (!esEdited && occasion) {
      const filled = fillOccasion(occasion, associationName, next)
      setEsSubject(filled.es.subject)
      setEsBody(filled.es.body)
    }
  }

  function useSimpleVersion() {
    if (!templateDraft) return
    setSubject(templateDraft.subject)
    setBody(templateDraft.body)
    setSource('template')
    setNotice(null)
  }

  async function translate() {
    setEsLoading(true)
    setEsError(null)
    try {
      const res = await fetch('/api/ai/translate-communication', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), bodyHtml: plainTextToHtml(body) }),
      })
      if (!res.ok) throw new Error(await responseErrorMessage(res, `Translation failed (${res.status}).`))
      const data = (await res.json().catch(() => null)) as { subject?: unknown; bodyHtml?: unknown } | null
      if (!data || typeof data.subject !== 'string' || typeof data.bodyHtml !== 'string') {
        throw new Error('Translation failed. Try again.')
      }
      setEsSubject(data.subject)
      setEsBody(htmlToPlainEditorText(data.bodyHtml) ?? htmlToPlainText(data.bodyHtml))
      setEsEdited(true)
    } catch (err) {
      setEsError(err instanceof Error ? err.message : 'Translation failed.')
    } finally {
      setEsLoading(false)
    }
  }

  function toggleSpanish(on: boolean) {
    setEsOn(on)
    setEsError(null)
    if (on && isCustom && !esEdited) void translate()
  }

  // ── Review and send ─────────────────────────────────────────────────

  const spanishReady = esOn && esSubject.trim() !== '' && esBody.trim() !== ''
  const bodyHtml = useMemo(() => plainTextToHtml(body), [body])
  const spanishHtml = useMemo(() => (spanishReady ? plainTextToHtml(esBody) : ''), [spanishReady, esBody])
  const streetPick = street ? streetSelection(street, new Set(), ownersOnly) : null
  const recipientCount = audienceMode === 'street' ? (streetPick?.count ?? 0) : everyoneCount

  const previewAudience = useMemo(
    () =>
      audienceMode === 'street' && street
        ? ({
            kind: 'specific_units',
            unitIds: street.unitIds,
            street: street.label,
            ...(ownersOnly ? { ownersOnly: true } : {}),
          } as { kind: string })
        : ({ kind: 'everyone' } as { kind: string }),
    [audienceMode, street, ownersOnly],
  )

  function goReview() {
    if (subject.trim() === '' || body.trim().length < 10) {
      setError('Add a subject and a message first.')
      return
    }
    if (esOn && !spanishReady) {
      setError('Finish the Spanish version or turn it off.')
      return
    }
    setError(null)
    setStep('review')
  }

  function send() {
    setError(null)
    let scheduledFor: string | undefined
    if (when === 'later') {
      const at = scheduledLocal ? new Date(scheduledLocal) : null
      if (!at || Number.isNaN(at.getTime())) {
        setError('Pick the day and time to send it, or choose Send now.')
        return
      }
      if (at.getTime() < Date.now() + 60_000) {
        setError('Pick a time in the future, or choose Send now.')
        return
      }
      scheduledFor = at.toISOString()
    }
    if (audienceMode === 'street' && (!street || recipientCount === 0)) {
      setError('That street has no homes to send to. Choose All residents.')
      return
    }
    startSend(async () => {
      const result = await sendAnnouncement({
        occasionId: occasionId || CUSTOM_OCCASION_ID,
        subject,
        bodyText: body,
        spanish: spanishReady ? { subject: esSubject, bodyText: esBody, reviewed: true } : null,
        audience:
          audienceMode === 'street' && street
            ? { mode: 'street', streetKey: street.key, ...(ownersOnly ? { ownersOnly: true } : {}) }
            : { mode: 'all' },
        includeText: smsAvailable && includeText,
        ...(scheduledFor ? { scheduledFor } : {}),
        confirmed: true,
      }).catch(() => ({
        ok: false as const,
        error: 'We couldn’t confirm the send. Check Messages to see whether it went out before trying again.',
      }))
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSent({
        scheduled: Boolean(scheduledFor),
        communicationId: result.communicationId,
        recipientCount: result.recipientCount,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        heldCount: result.heldCount,
      })
    })
  }

  // ── Done ────────────────────────────────────────────────────────────

  if (sent) {
    return (
      <section ref={rootRef} className="space-y-4 rounded-xl border border-border bg-surface p-5" aria-live="polite">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden />
          <div className="space-y-1">
            <h2 data-step-heading tabIndex={-1} className="text-lg font-semibold text-foreground focus:outline-none">
              {sent.scheduled ? 'Scheduled' : 'Sent'}
            </h2>
            <p className="text-sm text-foreground-secondary">
              {sent.scheduled
                ? `It will go to ${sent.recipientCount} ${sent.recipientCount === 1 ? 'home' : 'homes'} at the time you chose.`
                : `It went to ${sent.recipientCount} ${sent.recipientCount === 1 ? 'home' : 'homes'}.` +
                  (sent.failedCount > 0 ? ` ${sent.failedCount} could not be delivered.` : '') +
                  (sent.heldCount > 0 ? ` ${sent.heldCount} were held back by the safety check.` : '')}
            </p>
            <p className="text-sm text-muted">
              Residents who turned off emails or texts were skipped. You can see who got it in Messages.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href={`/communications/${sent.communicationId}`}>See who got it</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/communications/announce">Write another</Link>
          </Button>
        </div>
      </section>
    )
  }

  // ── Screens ─────────────────────────────────────────────────────────

  return (
    <div ref={rootRef} className="space-y-5">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Steps">
        {STEPS.map((s) => (
          <li
            key={s.id}
            aria-current={s.id === step ? 'step' : undefined}
            className={
              s.id === step
                ? 'rounded-full bg-primary px-3 py-1 font-medium text-primary-fg'
                : 'rounded-full bg-subtle px-3 py-1 text-muted'
            }
          >
            {s.label}
          </li>
        ))}
      </ol>

      {error ? <Alert variant="error">{error}</Alert> : null}

      {step === 'pick' ? (
        <div className="space-y-5">
          <h2 data-step-heading tabIndex={-1} className="text-base font-semibold text-foreground focus:outline-none">
            What is it about?
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {GRID_OCCASIONS.map((o) => {
              const Icon = ICONS[o.icon]
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => pickOccasion(o)}
                    className="flex h-full min-h-[104px] w-full flex-col items-start gap-2 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-primary hover:bg-primary-subtle/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon className="size-6 text-primary" aria-hidden />
                    <span className="text-sm font-medium leading-tight text-foreground">{o.label}</span>
                    <span className="text-xs leading-tight text-muted">{o.blurb}</span>
                  </button>
                </li>
              )
            })}
          </ul>

          <section className="space-y-3 rounded-xl border border-primary/30 bg-primary-subtle/40 p-4">
            <Field
              label="Or describe it in one sentence"
              hint="For example: Block party Saturday June 14 at 4pm at the pool. We pick out the date, time and place."
            >
              <Textarea
                value={sentence}
                onChange={(e) => setSentence(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    submitSentence()
                  }
                }}
                rows={2}
                maxLength={600}
                placeholder="Halloween party Oct 31 at 6pm at the clubhouse"
              />
            </Field>
            <Button type="button" size="lg" icon={<Sparkles aria-hidden />} onClick={submitSentence}>
              Write it for me
            </Button>
          </section>
        </div>
      ) : null}

      {step === 'draft' ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 data-step-heading tabIndex={-1} className="text-base font-semibold text-foreground focus:outline-none">
              {occasion ? occasion.label : 'Your announcement'}
            </h2>
            <Button type="button" variant="ghost" onClick={() => setStep('pick')}>
              Change occasion
            </Button>
          </div>

          {polishing ? (
            <Alert variant="info">Polishing your wording. The simple version below is ready to use meanwhile.</Alert>
          ) : notice ? (
            <Alert variant="info">
              {notice}
              {templateDraft && source === 'ai' ? (
                <>
                  {' '}
                  <button type="button" className="underline" onClick={useSimpleVersion}>
                    Use the simple version
                  </button>
                </>
              ) : null}
            </Alert>
          ) : null}

          {(occasion?.asks ?? ['date', 'time', 'place']).some((a) => a !== 'detail') ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {(occasion?.asks ?? ['date', 'time', 'place']).includes('date') ? (
                <Field label="Date" optional>
                  <Input type="date" value={facts.date} onChange={(e) => changeFact('date', e.target.value)} />
                </Field>
              ) : null}
              {(occasion?.asks ?? ['date', 'time', 'place']).includes('time') ? (
                <Field label="Time" optional>
                  <Input type="time" value={facts.time} onChange={(e) => changeFact('time', e.target.value)} />
                </Field>
              ) : null}
              {(occasion?.asks ?? ['date', 'time', 'place']).includes('place') ? (
                <Field label="Where" optional>
                  <Input
                    value={facts.place}
                    maxLength={120}
                    placeholder="the clubhouse"
                    onChange={(e) => changeFact('place', e.target.value)}
                  />
                </Field>
              ) : null}
            </div>
          ) : null}

          {occasion?.asks.includes('detail') ? (
            <Field label={occasion.detailLabel ?? 'Anything to add?'} optional>
              <Textarea
                rows={2}
                maxLength={600}
                value={facts.detail}
                onChange={(e) => changeFact('detail', e.target.value)}
              />
            </Field>
          ) : null}

          <Field label="Subject">
            <Input
              value={subject}
              maxLength={120}
              onChange={(e) => {
                setSubject(e.target.value)
                setSource('edited')
              }}
            />
          </Field>
          <Field label="Message" hint="Plain words. Leave a blank line between paragraphs. You can change anything.">
            <Textarea
              rows={10}
              value={body}
              onChange={(e) => {
                setBody(e.target.value)
                setSource('edited')
              }}
            />
          </Field>

          <section className="space-y-3 rounded-xl border border-border bg-subtle/50 p-4">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                className="size-5"
                checked={esOn}
                onChange={(e) => toggleSpanish(e.target.checked)}
              />
              <Languages className="size-4 text-muted" aria-hidden />
              Also send it in Spanish
            </label>
            {esOn ? (
              <div className="space-y-3">
                <p className="text-xs text-muted">
                  {isCustom
                    ? 'AI translated this. Read it and fix anything before you send.'
                    : 'Ready-made Spanish. Read it and change anything you like.'}
                </p>
                {esError ? <Alert variant="warning">{esError}</Alert> : null}
                <Field label="Asunto">
                  <Input
                    value={esSubject}
                    maxLength={120}
                    disabled={esLoading}
                    onChange={(e) => {
                      setEsSubject(e.target.value)
                      setEsEdited(true)
                    }}
                  />
                </Field>
                <Field label="Mensaje">
                  <Textarea
                    rows={8}
                    value={esBody}
                    disabled={esLoading}
                    onChange={(e) => {
                      setEsBody(e.target.value)
                      setEsEdited(true)
                    }}
                  />
                </Field>
                {isCustom ? (
                  <Button type="button" variant="secondary" loading={esLoading} onClick={() => void translate()}>
                    Translate again
                  </Button>
                ) : null}
              </div>
            ) : null}
          </section>

          <div className="flex flex-wrap gap-3">
            <Button type="button" size="lg" onClick={goReview} disabled={polishing || esLoading}>
              Looks good, review it
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'review' ? (
        <div className="space-y-5">
          <section role="radiogroup" aria-labelledby="announce-audience-h" className="space-y-3 rounded-xl border border-border bg-surface p-4">
            <h2 id="announce-audience-h" data-step-heading tabIndex={-1} className="text-base font-semibold text-foreground focus:outline-none">
              Who gets it
            </h2>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-foreground">
              <input
                type="radio"
                name="audience"
                className="size-5"
                checked={audienceMode === 'all'}
                onChange={() => setAudienceMode('all')}
              />
              All residents ({everyoneCount} {everyoneCount === 1 ? 'home' : 'homes'})
            </label>
            {streets.length > 0 ? (
              <div className="space-y-2">
                <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-foreground">
                  <input
                    type="radio"
                    name="audience"
                    className="size-5"
                    checked={audienceMode === 'street'}
                    onChange={() => setAudienceMode('street')}
                  />
                  Only one street
                </label>
                {audienceMode === 'street' ? (
                  <div className="space-y-2 pl-8">
                    <select
                      aria-label="Street"
                      className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm"
                      value={streetKey}
                      onChange={(e) => setStreetKey(e.target.value)}
                    >
                      {streets.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label} ({s.unitIds.length})
                        </option>
                      ))}
                    </select>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-foreground">
                      <input
                        type="checkbox"
                        className="size-5"
                        checked={ownersOnly}
                        onChange={(e) => setOwnersOnly(e.target.checked)}
                      />
                      Owners only
                    </label>
                    <p className="text-xs text-muted">
                      {recipientCount} {recipientCount === 1 ? 'home' : 'homes'} will get it.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
            <p className="text-xs text-muted">
              Residents who turned off emails are skipped. Texts only go to residents who opted in to texts.
            </p>
          </section>

          {smsAvailable ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface p-4 text-sm text-foreground">
              <input
                type="checkbox"
                className="size-5"
                checked={includeText}
                onChange={(e) => setIncludeText(e.target.checked)}
              />
              Also send a short text to residents who opted in
            </label>
          ) : null}

          <PhonePreview
            audience={previewAudience}
            subject={subject}
            bodyHtml={bodyHtml}
            spanish={spanishReady ? { subject: esSubject, bodyHtml: spanishHtml } : null}
            showText={smsAvailable && includeText}
            showPortal
            disabled={sending}
          />

          <section role="radiogroup" aria-labelledby="announce-when-h" className="space-y-3 rounded-xl border border-border bg-surface p-4">
            <h2 id="announce-when-h" className="text-base font-semibold text-foreground">When</h2>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-foreground">
              <input
                type="radio"
                name="when"
                className="size-5"
                checked={when === 'now'}
                onChange={() => setWhen('now')}
              />
              Send now
            </label>
            {schedulingEnabled ? (
              <div className="space-y-2">
                <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-foreground">
                  <input
                    type="radio"
                    name="when"
                    className="size-5"
                    checked={when === 'later'}
                    onChange={() => setWhen('later')}
                  />
                  Schedule for later
                </label>
                {when === 'later' ? (
                  <div className="pl-8">
                    <Field label="Day and time">
                      <Input
                        type="datetime-local"
                        value={scheduledLocal}
                        onChange={(e) => setScheduledLocal(e.target.value)}
                      />
                    </Field>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" size="lg" onClick={send} loading={sending}>
              {when === 'later' ? 'Schedule it' : `Send to ${recipientCount} ${recipientCount === 1 ? 'home' : 'homes'}`}
            </Button>
            <Button type="button" size="lg" variant="ghost" onClick={() => setStep('draft')} disabled={sending}>
              Back to the draft
            </Button>
          </div>
          <p className="text-xs text-muted">Nothing is sent until you press this button.</p>
        </div>
      ) : null}
    </div>
  )
}
