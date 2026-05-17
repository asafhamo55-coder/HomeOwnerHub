'use client'

import { useState, useTransition } from 'react'
import { Save, Sparkles } from 'lucide-react'
import { Alert, Button, Textarea } from '@homeowner-portal/ui'
import { updateParsedText } from '@/lib/documents'

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
        const body = await res.json().catch(() => ({}))
        setParseError(body?.message ?? 'AI is unavailable right now. Try again shortly.')
        return
      }
      const body = await res.json()
      setSections(body.sections)
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder="Paste the document's plain text here. The AI uses this to match violations to specific sections."
          className="font-mono text-xs"
          disabled={savingTransition || parsingTransition}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">{text.length.toLocaleString()} characters</p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              loading={savingTransition}
              disabled={!text.trim()}
            >
              <Save className="h-4 w-4" />
              Save text
            </Button>
            <Button
              size="sm"
              onClick={handleAIParse}
              loading={parsingTransition}
              disabled={!text.trim() || text.length < 200}
            >
              <Sparkles className="h-4 w-4" />
              Extract sections
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <Alert variant="error" title="Couldn't save">
          {error}
        </Alert>
      ) : null}
      {parseError ? (
        <Alert variant="warning" title="AI unavailable">
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
