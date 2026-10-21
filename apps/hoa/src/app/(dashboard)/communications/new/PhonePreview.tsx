'use client'

import { useEffect, useId, useState, useTransition } from 'react'
import { Loader2, Send } from 'lucide-react'
import { Alert, Button, cn } from '@homeowner-portal/ui'
import {
  previewForSample,
  sendTestToMe,
  type PreviewForSampleResult,
  type PreviewInput,
} from '@/lib/communications/preview-actions'

type Tab = 'email' | 'text' | 'portal' | 'es'

const TAB_LABEL: Record<Tab, string> = { email: 'Email', text: 'Text', portal: 'Portal', es: 'Español' }

/** Plain styling for the rendered email inside the phone frame. The frame
 *  is sandboxed (no scripts, no same-origin), so the message's own HTML
 *  can't touch the app. */
function frameDoc(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:15px;line-height:1.5;margin:14px;color:#1a1a1a;background:#fff;word-wrap:break-word}a{color:#1d4ed8}img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${html}</body></html>`
}

/**
 * The line under "What residents get". It used to read "Shown as Resident
 * (no contact on file) gets it", which isn't a sentence.
 */
export function previewCaption(result: PreviewForSampleResult | null): string {
  if (!result?.ok) return 'A preview of one home’s message.'
  if (result.synthetic) return 'Shown for a sample resident.'
  return `Shown for ${result.sampleName}. Each person sees their own name.`
}

/**
 * BL-102 A7: exactly what one resident gets, in a phone frame, rendered on
 * the server by the send's own functions (lib/communications/preview.ts).
 * A merge field with no value shows as "[Due date]" and is listed above the
 * frame, so it is fixed before Send rather than failing every recipient.
 *
 * "Send a test to me" emails only the signed-in board member, through the
 * outbound guard. Nothing here sends to residents.
 */
export function PhonePreview({
  audience,
  subject,
  bodyHtml,
  extraFields,
  spanish,
  showText,
  showPortal,
  disabled,
}: {
  /** The wizard's audience definition; the server validates the kind. */
  audience: { kind: string } | null
  subject: string
  bodyHtml: string
  extraFields?: Record<string, string | number | null>
  spanish: { subject: string; bodyHtml: string } | null
  showText: boolean
  showPortal: boolean
  disabled: boolean
}) {
  const [result, setResult] = useState<PreviewForSampleResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('email')
  const [testPending, startTest] = useTransition()
  const [testMessage, setTestMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const uid = useId()
  const panelId = `${uid}-panel`
  const tabId = (t: Tab) => `${uid}-tab-${t}`

  // One key for everything the preview depends on, so a new object with
  // the same content doesn't refetch.
  const requestKey = JSON.stringify({ audience, subject, bodyHtml, extraFields, spanish })

  useEffect(() => {
    if (!audience || !subject || !bodyHtml.trim()) {
      setResult(null)
      return
    }
    let cancelled = false
    setLoading(true)
    // A short pause so typing on the earlier steps doesn't fire a request
    // per keystroke when the board comes back here.
    const timer = setTimeout(() => {
      previewForSample({ audience: audience as PreviewInput['audience'], subject, bodyHtml, extraFields, spanish })
        .then((r) => {
          if (!cancelled) setResult(r)
        })
        .catch(() => {
          if (!cancelled) setResult({ ok: false, error: 'Couldn’t build the preview. Try again.' })
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // requestKey stands for every input above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  const tabs: Tab[] = ['email']
  if (showText) tabs.push('text')
  if (showPortal) tabs.push('portal')
  if (result?.ok && result.spanish) tabs.push('es')
  const active: Tab = tabs.includes(tab) ? tab : 'email'

  function sendTest() {
    setTestMessage(null)
    startTest(async () => {
      const r = await sendTestToMe({ subject, bodyHtml, extraFields, spanish })
      setTestMessage(
        r.ok
          ? { ok: true, text: 'Test sent to your own email. Residents got nothing.' }
          : { ok: false, text: r.error },
      )
    })
  }

  return (
    <section className="space-y-3 rounded-lg border border-border p-4" aria-label="Phone preview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">What residents get</h3>
          <p className="text-xs text-muted">
            {previewCaption(result)}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="xs"
          icon={<Send aria-hidden />}
          onClick={sendTest}
          loading={testPending}
          disabled={disabled || testPending || !subject || !bodyHtml.trim()}
        >
          Send a test to me
        </Button>
      </div>

      {testMessage ? (
        <Alert variant={testMessage.ok ? 'success' : 'error'}>{testMessage.text}</Alert>
      ) : null}

      {result?.ok && result.blanks.length > 0 ? (
        <Alert variant="warning" title={`This message has ${result.blanks.length === 1 ? 'a blank' : 'blanks'}`}>
          Fill in {result.blanks.join(', ')} before sending. It shows in [brackets] below.
        </Alert>
      ) : null}

      <div
        role="tablist"
        aria-label="Preview channel"
        className="flex flex-wrap gap-1"
        onKeyDown={(e) => {
          // WAI-ARIA tabs: arrows move between tabs (and select, as each
          // panel is already rendered), Home/End jump to the ends.
          const i = tabs.indexOf(active)
          const next =
            e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length]
            : e.key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length]
            : e.key === 'Home' ? tabs[0]
            : e.key === 'End' ? tabs[tabs.length - 1]
            : null
          if (!next) return
          e.preventDefault()
          setTab(next)
          document.getElementById(tabId(next))?.focus()
        }}
      >
        {tabs.map((t) => (
          <button
            key={t}
            id={tabId(t)}
            type="button"
            role="tab"
            aria-selected={active === t}
            aria-controls={panelId}
            tabIndex={active === t ? 0 : -1}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-md px-3 py-1 text-sm font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active === t ? 'bg-primary text-primary-fg' : 'text-foreground-secondary hover:bg-subtle',
            )}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(active)}
        className="mx-auto w-full max-w-[22rem] rounded-[2rem] border-[6px] border-foreground/80 bg-background p-2 shadow-sm"
      >
        <div className="min-h-[20rem] overflow-hidden rounded-[1.4rem] border border-border bg-surface">
          {!audience ? (
            <p className="p-4 text-sm text-muted">Pick an audience to see the preview.</p>
          ) : loading && !result ? (
            <p className="inline-flex items-center gap-1.5 p-4 text-sm text-muted" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Building the preview…
            </p>
          ) : !result ? null : !result.ok ? (
            <div className="p-3">
              <Alert variant="warning">{result.error}</Alert>
            </div>
          ) : active === 'text' ? (
            <div className="space-y-2 p-3">
              <p className="text-center text-xs text-muted">Text message</p>
              <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-subtle px-3 py-2 text-sm text-foreground">
                {result.sms.body}
              </p>
              <p className="text-xs text-muted">
                {result.sms.chars} of {result.sms.max} characters
                {result.sms.shortened ? '. Shortened to fit one text; it ends with a link to the full message.' : '.'}
                {result.sms.englishOnly ? ' Both languages don’t fit, so the text is English only.' : ''}
              </p>
            </div>
          ) : (
            <MessageScreen
              label={active === 'portal' ? 'Resident portal' : active === 'es' ? 'Email · Español' : 'Email'}
              subject={active === 'es' && result.spanish ? result.spanish.subject : result.email.subject}
              html={active === 'es' && result.spanish ? result.spanish.html : active === 'portal' ? result.portal.html : result.email.html}
            />
          )}
        </div>
      </div>
      <p className="text-center text-xs text-muted">
        Email has no length limit. A text is at most 279 characters; a longer message is shortened with a link.
      </p>
    </section>
  )
}

function MessageScreen({ label, subject, html }: { label: string; subject: string; html: string }) {
  return (
    <div>
      <div className="border-b border-border px-3 py-2">
        <p className="text-xs text-muted">{label}</p>
        <p className="text-sm font-semibold text-foreground">{subject}</p>
      </div>
      <iframe
        title={`${label} preview`}
        sandbox=""
        srcDoc={frameDoc(html)}
        className="block h-[26rem] w-full bg-white"
      />
    </div>
  )
}
