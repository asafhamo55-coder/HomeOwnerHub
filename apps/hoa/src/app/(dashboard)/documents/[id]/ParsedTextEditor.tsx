'use client'

import { useState, useTransition } from 'react'
import { Save, Sparkles } from 'lucide-react'
import { Alert, Button, Field, Textarea } from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import { updateParsedText } from '@/lib/documents'
import { responseErrorMessage } from '@/lib/api/client'

interface ParsedTextEditorProps {
  documentId: string
  initialText: string | null
  initialSections: Array<{ number: string; title: string; summary: string }> | null
}

export function ParsedTextEditor({
  documentId,
  initialText,
  initialSections,
}: ParsedTextEditorProps) {
  const [text, setText] = useState(initialText ?? '')
  const [sections, setSections] = useState(initialSections ?? null)
  const [error, setError] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [savingTransition, startSaving] = useTransition()
  const [parsingTransition, startParsing] = useTransition()

  function handleSave() {
    setError(null)
    startSaving(async () => {
      try {
        await updateParsedText(documentId, text)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save.')
      }
    })
  }

  function handleAIParse() {
    setParseError(null)
    startParsing(async () => {
      const res = await fetch('/api/ai/parse-document', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ documentId, rawText: text }),
      })
      if (!res.ok) {
        setParseError(await responseErrorMessage(res, 'AI is unavailable right now. Try again shortly.'))
        return
      }
      const body = (await res.json().catch(() => null)) as { sections?: typeof sections } | null
      setSections(body?.sections ?? [])
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Field
          label="Document text"
          labelAside={
            <AiRewriteButton
              value={text}
              onChange={setText}
              context="Plain text extracted from a governing document — preserve every section number, citation, and clause"
              disabled={savingTransition || parsingTransition}
            />
          }
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            placeholder="Paste the document's plain text here. It is used to match violations to specific sections."
            className="text-sm leading-relaxed"
            disabled={savingTransition || parsingTransition}
          />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="num text-xs text-muted">{text.length.toLocaleString()} characters</p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAIParse}
              loading={parsingTransition}
              disabled={!text.trim() || text.length < 200}
              icon={<Sparkles aria-hidden />}
            >
              Extract sections
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              loading={savingTransition}
              disabled={!text.trim()}
              icon={<Save aria-hidden />}
            >
              Save text
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <Alert variant="error" title="Couldn’t save">
          {error}
        </Alert>
      ) : null}
      {parseError ? (
        <Alert variant="warning" title="Couldn’t extract sections">
          {parseError}
        </Alert>
      ) : null}

      {sections && sections.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Extracted sections</p>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
            {sections.map((s, i) => (
              <li key={`${s.number}-${i}`} className="flex flex-col gap-0.5 px-4 py-2">
                <p className="font-medium text-foreground">
                  {s.number} — {s.title}
                </p>
                <p className="text-xs text-muted">{s.summary}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
