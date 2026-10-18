'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ListChecks, MessageCircleQuestion, ThumbsUp, X } from 'lucide-react'
import { Alert, Button, Dialog, DialogContent, Field, Textarea, useToast } from '@homeowner-portal/ui'
import { requestArcInfo, respondToArcRequest } from '@/lib/board-review'
import { hasUnfilledBlanks } from '@/lib/inbox/draft/blanks'
import { ARC_LETTER_MAX, type ArcLetterKind, type ArcSuggestedDecision } from '@/lib/arc-review/model'

// BL-027 / BL-079 — the board's decision on an ARC application, started
// from the AI review. It decides through the EXISTING ARC actions only:
//   Approve / Approve with conditions → respondToArcRequest 'approved'
//   Deny                              → respondToArcRequest 'denied'
//   Request info                      → requestArcInfo (a resident-visible reply + Mark in review)
// Each dialog opens on a full decision letter drafted from the review's
// cited rules and conditions (lib/arc-review/model decisionLetter). The
// board edits it; the resident sees the final text verbatim in their
// portal. Nothing is sent until a button is pressed, and never while a
// [[BLANK: …]] placeholder is left in the letter.

const COPY: Record<ArcLetterKind, { button: string; title: string; confirm: string; label: string; hint: string; done: string }> = {
  approve: {
    button: 'Approve',
    title: 'Approve this application?',
    confirm: 'Approve application',
    label: 'Decision letter',
    hint: 'The resident sees this letter verbatim in their portal.',
    done: 'Application approved.',
  },
  approve_with_conditions: {
    button: 'Approve with conditions',
    title: 'Approve with conditions?',
    confirm: 'Approve with conditions',
    label: 'Decision letter',
    hint: 'List every condition. The resident sees this letter verbatim in their portal.',
    done: 'Application approved with conditions.',
  },
  deny: {
    button: 'Deny',
    title: 'Deny this application?',
    confirm: 'Deny application',
    label: 'Decision letter',
    hint: 'Say why, citing the rule. The resident sees this letter verbatim in their portal.',
    done: 'Application denied.',
  },
  need_more_info: {
    button: 'Request info',
    title: 'Ask the resident for more information?',
    confirm: 'Send request',
    label: 'Message to the resident',
    hint: 'Sent as a reply in the application’s conversation. The application moves to In review.',
    done: 'Request sent to the resident.',
  },
}

export const BLANKS_LEFT = 'Fill in or delete each [[BLANK: …]] before sending.'

/** Which button the AI's suggestion points at, if any. */
export function suggestedButton(s: ArcSuggestedDecision | null): ArcLetterKind | null {
  return s ?? null
}

/**
 * The buttons to show. The detail page shows all four; the approvals inbox
 * (compact) shows three, with Approve becoming Approve with conditions when
 * that is what the AI suggested.
 */
export function letterButtons(suggestion: ArcSuggestedDecision | null, compact: boolean): ArcLetterKind[] {
  if (!compact) return ['approve', 'approve_with_conditions', 'deny', 'need_more_info']
  return [suggestion === 'approve_with_conditions' ? 'approve_with_conditions' : 'approve', 'deny', 'need_more_info']
}

/** What the board's letter is checked for before it is sent. Null when it can go. */
export function letterProblem(kind: ArcLetterKind, text: string): string | null {
  if (kind === 'need_more_info' && !text.trim()) return 'Write what the resident should send.'
  if (hasUnfilledBlanks(text)) return BLANKS_LEFT
  return null
}

export function ArcReviewActions({
  arcId,
  title,
  drafts,
  suggestion,
  size = 'sm',
  compact = false,
}: {
  arcId: string
  title: string
  drafts: Record<ArcLetterKind, string>
  suggestion: ArcSuggestedDecision | null
  size?: 'sm' | 'md'
  compact?: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState<ArcLetterKind | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const suggested = suggestedButton(suggestion)

  function start(k: ArcLetterKind) {
    setText(drafts[k])
    setError(null)
    setOpen(k)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!open) return
    const k = open
    const problem = letterProblem(k, text)
    if (problem) {
      setError(problem)
      return
    }
    startTransition(async () => {
      const r =
        k === 'need_more_info'
          ? await requestArcInfo({ arcId, message: text.trim() })
          : await respondToArcRequest({ arcId, decision: k === 'deny' ? 'denied' : 'approved', boardResponse: text.trim() || null })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setOpen(null)
      toast({ tone: 'success', message: COPY[k].done })
      router.refresh()
    })
  }

  const icon: Record<ArcLetterKind, React.ReactNode> = {
    approve: <ThumbsUp aria-hidden />,
    approve_with_conditions: <ListChecks aria-hidden />,
    deny: <X aria-hidden />,
    need_more_info: <MessageCircleQuestion aria-hidden />,
  }
  const copy = open ? COPY[open] : null

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {letterButtons(suggestion, compact).map((k) => (
        <Button
          key={k}
          size={size}
          variant={k === suggested ? 'primary' : 'secondary'}
          icon={icon[k]}
          onClick={() => start(k)}
          disabled={pending}
          aria-describedby={k === suggested ? `arc-suggested-${arcId}` : undefined}
        >
          {COPY[k].button}
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
            size="lg"
            title={copy.title}
            description={title}
            footer={
              <>
                <Button variant="ghost" onClick={() => setOpen(null)} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" form={`arc-decide-${arcId}`} variant={open === 'deny' ? 'destructive' : 'primary'} loading={pending}>
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
  const blanks = hasUnfilledBlanks(value)
  return (
    <div className="space-y-2">
      <Field
        label={label}
        hint={drafted ? `${hint} Drafted from the AI review’s cited rules — read and edit it before sending.` : hint}
      >
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={14}
          maxLength={ARC_LETTER_MAX}
          disabled={disabled}
          className="leading-relaxed"
        />
      </Field>
      {blanks ? (
        <Alert variant="warning" title="Fill in the blanks">
          Replace each [[BLANK: …]] with the right text, or delete the line. The letter can’t be sent with a blank in it.
        </Alert>
      ) : null}
    </div>
  )
}
