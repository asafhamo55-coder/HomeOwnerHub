'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { MessageCircleQuestion, ThumbsUp, X } from 'lucide-react'
import { Alert, Button, Dialog, DialogContent, Field, Textarea, useToast } from '@homeowner-portal/ui'
import { requestArcInfo, respondToArcRequest } from '@/lib/board-review'
import type { ArcSuggestedDecision, BoardArcDecision } from '@/lib/arc-review/model'

// BL-027 — the board's decision on an ARC application, started from the
// AI review. It decides through the EXISTING ARC actions only:
//   Approve / Deny  → respondToArcRequest (the same call as the Decision card)
//   Request info    → requestArcInfo (a resident-visible reply + Mark in review)
// The AI's draft text is a starting point the board edits; the resident
// sees the final text verbatim. Nothing happens until a button is pressed.

const COPY: Record<BoardArcDecision, { button: string; title: string; confirm: string; label: string; hint: string; done: string }> = {
  approved: {
    button: 'Approve',
    title: 'Approve this application?',
    confirm: 'Approve application',
    label: 'Board response',
    hint: 'Optional. Conditions or notes. The resident sees this verbatim in their portal.',
    done: 'Application approved.',
  },
  denied: {
    button: 'Deny',
    title: 'Deny this application?',
    confirm: 'Deny application',
    label: 'Board response',
    hint: 'Say why, citing the rule. The resident sees this verbatim in their portal.',
    done: 'Application denied.',
  },
  more_info: {
    button: 'Request info',
    title: 'Ask the resident for more information?',
    confirm: 'Send request',
    label: 'Message to the resident',
    hint: 'Sent as a reply in the application’s conversation. The application moves to In review.',
    done: 'Request sent to the resident.',
  },
}

/** Which button the AI's suggestion points at, if any. */
export function suggestedButton(s: ArcSuggestedDecision | null): BoardArcDecision | null {
  if (s === 'approve' || s === 'approve_with_conditions') return 'approved'
  if (s === 'deny') return 'denied'
  if (s === 'need_more_info') return 'more_info'
  return null
}

export function ArcReviewActions({
  arcId,
  title,
  drafts,
  suggestion,
  size = 'sm',
}: {
  arcId: string
  title: string
  drafts: Record<BoardArcDecision, string>
  suggestion: ArcSuggestedDecision | null
  size?: 'sm' | 'md'
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState<BoardArcDecision | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const suggested = suggestedButton(suggestion)

  function start(d: BoardArcDecision) {
    setText(drafts[d])
    setError(null)
    setOpen(d)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!open) return
    const d = open
    if (d === 'more_info' && !text.trim()) {
      setError('Write what the resident should send.')
      return
    }
    startTransition(async () => {
      const r =
        d === 'more_info'
          ? await requestArcInfo({ arcId, message: text.trim() })
          : await respondToArcRequest({ arcId, decision: d, boardResponse: text.trim() || null })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setOpen(null)
      toast({ tone: 'success', message: COPY[d].done })
      router.refresh()
    })
  }

  const order: BoardArcDecision[] = ['approved', 'denied', 'more_info']
  const icon: Record<BoardArcDecision, React.ReactNode> = {
    approved: <ThumbsUp aria-hidden />,
    denied: <X aria-hidden />,
    more_info: <MessageCircleQuestion aria-hidden />,
  }
  const copy = open ? COPY[open] : null

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {order.map((d) => (
        <Button
          key={d}
          size={size}
          variant={d === suggested ? 'primary' : 'secondary'}
          icon={icon[d]}
          onClick={() => start(d)}
          disabled={pending}
          aria-describedby={d === suggested ? `arc-suggested-${arcId}` : undefined}
        >
          {COPY[d].button}
        </Button>
      ))}
      {suggested ? (
        <span id={`arc-suggested-${arcId}`} className="sr-only">
          Matches the AI suggestion
        </span>
      ) : null}
      <Dialog open={open !== null} onOpenChange={(next) => !pending && !next && setOpen(null)}>
        {copy ? (
          <DialogContent
            title={copy.title}
            description={title}
            footer={
              <>
                <Button variant="ghost" onClick={() => setOpen(null)} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" form={`arc-decide-${arcId}`} variant={open === 'denied' ? 'destructive' : 'primary'} loading={pending}>
                  {copy.confirm}
                </Button>
              </>
            }
          >
            <form id={`arc-decide-${arcId}`} onSubmit={submit} className="space-y-3">
              <ArcDecisionDraftField label={copy.label} hint={copy.hint} value={text} onChange={setText} disabled={pending} drafted={!!drafts[open!]} />
              {error ? <Alert variant="error">{error}</Alert> : null}
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  )
}

/** The dialog body, separate so previews can render it without a portal. */
export function ArcDecisionDraftField({
  label,
  hint,
  value,
  onChange,
  disabled,
  drafted,
}: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  drafted: boolean
}) {
  return (
    <Field label={label} hint={drafted ? `${hint} Started from the AI review — edit it before sending.` : hint}>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={6} maxLength={4000} disabled={disabled} />
    </Field>
  )
}
