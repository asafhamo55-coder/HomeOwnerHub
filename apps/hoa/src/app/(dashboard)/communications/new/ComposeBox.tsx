'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Alert, Button, Field, Textarea } from '@homeowner-portal/ui'
import type { CommProposal } from '@homeowner-portal/workflows/W31-propose'
import { responseErrorMessage } from '@/lib/api/client'
import { localNowString } from '@/lib/communications/proposal-to-wizard'

/**
 * BL-102 A2: "What do you want to tell residents?" The board types a
 * sentence; the AI proposes a draft that fills the wizard's fields for the
 * board to review. Nothing is sent from here. On any failure the board
 * just writes the message below, as before.
 */
export function ComposeBox({
  onProposal,
  disabled,
}: {
  onProposal: (proposal: CommProposal) => void
  disabled?: boolean
}) {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function draft() {
    const trimmed = message.trim()
    if (trimmed.length < 3) {
      setError('Write a sentence about what you want to tell residents.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/ai/compose-communication', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: trimmed, localNow: localNowString() }),
      })
      if (!res.ok) {
        setError(await responseErrorMessage(res, 'The AI couldn’t draft this right now. Write the message yourself below.'))
        return
      }
      const body = (await res.json()) as { proposal?: CommProposal }
      if (!body.proposal) {
        setError('The AI couldn’t draft this right now. Write the message yourself below.')
        return
      }
      onProposal(body.proposal)
    } catch {
      setError('The AI couldn’t be reached. Check your connection, or write the message yourself below.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-primary/30 bg-primary-subtle/40 p-4">
      <Field
        label="What do you want to tell residents?"
        optional
        hint="Say it in your own words. We draft the message and pick who gets it. You check everything before it is sent."
      >
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            // Enter in the wizard form means "continue"; here it drafts.
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void draft()
            }
          }}
          rows={3}
          maxLength={1000}
          disabled={disabled || loading}
          placeholder="e.g. Water will be off Thursday 9 to 2 on Elm St for a pipe repair."
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="primary"
          size="sm"
          icon={<Sparkles aria-hidden />}
          loading={loading}
          onClick={() => void draft()}
          disabled={disabled}
        >
          Draft it for me
        </Button>
        <span className="text-xs text-muted">Or pick a template below and write it yourself.</span>
      </div>
      {error ? <Alert variant="warning">{error}</Alert> : null}
    </section>
  )
}
