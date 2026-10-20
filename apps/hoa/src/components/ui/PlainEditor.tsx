'use client'

import { useEffect, useRef, useState } from 'react'
import { Bold, Code2, List, UserRound } from 'lucide-react'
import { Alert, Button, Textarea } from '@homeowner-portal/ui'
import { MERGE_CHIPS, chipToken, htmlToPlainEditorText, plainTextToHtml } from '@/lib/communications/plain-text'

/**
 * BL-102 A3: the message body editor. The board writes plain text (blank
 * line = new paragraph, "- " bullets, **bold**, pasted links) and inserts
 * "[Resident's name]" / "[HOA name]" from buttons instead of typing
 * {{ merge_fields }}. The wizard's state stays the stored HTML: every edit
 * goes through plainTextToHtml, which escapes what was typed.
 *
 * A body the plain format cannot hold (a designed community template, the
 * Spanish section, inline styles) opens in HTML mode with a note, rather
 * than silently losing its layout. "Edit as HTML" is always available for
 * the rare power user.
 */
export function PlainEditor({
  html,
  onChange,
  disabled,
  invalid,
  aside,
}: {
  html: string
  onChange: (html: string) => void
  disabled?: boolean
  invalid?: boolean
  /** Extra controls next to the toolbar (e.g. the AI rewrite button), given the plain text. */
  aside?: (text: string, setText: (next: string) => void) => React.ReactNode
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [mode, setMode] = useState<'plain' | 'html'>(() => (htmlToPlainEditorText(html) === null ? 'html' : 'plain'))
  const [text, setText] = useState(() => htmlToPlainEditorText(html) ?? '')
  // The HTML this editor last emitted. A different `html` prop means the
  // body was replaced from outside (a template, the AI draft, a section
  // toggle), so the text is re-read from it.
  const lastEmitted = useRef(html)
  const [forcedHtml, setForcedHtml] = useState(() => htmlToPlainEditorText(html) === null)

  useEffect(() => {
    if (html === lastEmitted.current) return
    lastEmitted.current = html
    const next = htmlToPlainEditorText(html)
    if (next === null) {
      setMode('html')
      setForcedHtml(true)
    } else {
      setText(next)
      setForcedHtml(false)
      setMode('plain')
    }
  }, [html])

  function emitText(next: string) {
    setText(next)
    const out = plainTextToHtml(next)
    lastEmitted.current = out
    onChange(out)
  }

  function emitHtml(next: string) {
    lastEmitted.current = next
    onChange(next)
  }

  /** Insert or wrap at the cursor, keeping the caret where the board expects. */
  function edit(fn: (before: string, selected: string, after: string) => { value: string; caret: number }) {
    const el = ref.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const { value, caret } = fn(text.slice(0, start), text.slice(start, end), text.slice(end))
    emitText(value)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(caret, caret)
    })
  }

  function bold() {
    edit((b, s, a) => {
      const inner = s || 'bold words'
      return { value: `${b}**${inner}**${a}`, caret: b.length + inner.length + 4 }
    })
  }

  function bullet() {
    edit((b, s, a) => {
      const lineStart = b.lastIndexOf('\n') + 1
      const head = b.slice(0, lineStart)
      const line = b.slice(lineStart)
      if (/^\s*- /.test(line)) return { value: b + s + a, caret: b.length + s.length }
      const sel = s.split('\n').map((l, i) => (i === 0 || l.trim() === '' ? l : `- ${l}`)).join('\n')
      const value = `${head}- ${line}${sel}${a}`
      return { value, caret: head.length + 2 + line.length + sel.length }
    })
  }

  function insertChip(token: string) {
    edit((b, s, a) => ({ value: `${b}${token}${a}`, caret: b.length + token.length }))
  }

  function switchToHtml() {
    setMode('html')
  }

  function switchToPlain() {
    const next = htmlToPlainEditorText(html)
    if (next === null) {
      setForcedHtml(true)
      return
    }
    setForcedHtml(false)
    setText(next)
    setMode('plain')
  }

  if (mode === 'html') {
    return (
      <div className="space-y-2">
        {forcedHtml ? (
          <Alert variant="info">
            This message has a designed layout the simple editor can’t keep, so it is shown as HTML. You can still
            change the words between the tags.
          </Alert>
        ) : null}
        <Textarea
          value={html}
          onChange={(e) => emitHtml(e.target.value)}
          disabled={disabled}
          error={invalid}
          rows={12}
          className="font-mono text-xs sm:text-xs"
          aria-label="Message body (HTML)"
        />
        {!forcedHtml ? (
          <Button type="button" variant="link" size="sm" onClick={switchToPlain} disabled={disabled}>
            Back to the simple editor
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="toolbar"
        aria-label="Formatting"
        // role="toolbar" promises arrow-key movement between its buttons.
        // Tab still visits each one too.
        onKeyDown={(e) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
          const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])')]
          const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
          if (i < 0 || buttons.length === 0) return
          e.preventDefault()
          const n = buttons.length
          const next = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : e.key === 'ArrowRight' ? (i + 1) % n : (i - 1 + n) % n
          buttons[next]?.focus()
        }}
      >
        <Button type="button" variant="secondary" size="xs" icon={<Bold aria-hidden />} onClick={bold} disabled={disabled}>
          Bold
        </Button>
        <Button type="button" variant="secondary" size="xs" icon={<List aria-hidden />} onClick={bullet} disabled={disabled}>
          Bullet
        </Button>
        {MERGE_CHIPS.map((chip) => (
          <Button
            key={chip.field}
            type="button"
            variant="subtle"
            size="xs"
            icon={<UserRound aria-hidden />}
            onClick={() => insertChip(chipToken(chip))}
            disabled={disabled}
            title={`Filled in for each person: ${chipToken(chip)}`}
          >
            {chip.label}
          </Button>
        ))}
        <span className="ml-auto flex items-center gap-1.5">
          {aside ? aside(text, emitText) : null}
          <Button type="button" variant="ghost" size="xs" icon={<Code2 aria-hidden />} onClick={switchToHtml} disabled={disabled}>
            Edit as HTML
          </Button>
        </span>
      </div>
      <Textarea
        ref={ref}
        value={text}
        onChange={(e) => emitText(e.target.value)}
        disabled={disabled}
        error={invalid}
        rows={12}
        placeholder={"Hi [Resident's name],\n\nWrite your message here. Leave a blank line between paragraphs.\n\n[HOA name] Board"}
        aria-label="Message body"
      />
      <p className="text-xs text-muted">
        Blank line = new paragraph. Start a line with “- ” for a bullet. **Two stars** make words bold. Links work as
        you paste them.
      </p>
    </div>
  )
}
