'use client'

import { useActionState, useRef, useState } from 'react'
import Link from 'next/link'
import { Upload } from 'lucide-react'
import { Alert, Button, Input, Select, Textarea } from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import { uploadDocument, type UploadActionState } from '@/lib/documents'

const initial: UploadActionState = {}

const DOC_TYPES = [
  { value: 'ccr', label: 'CC&R' },
  { value: 'bylaws', label: 'Bylaws' },
  { value: 'rules', label: 'Rules & regulations' },
  { value: 'other', label: 'Other' },
]

export function UploadForm() {
  const [state, action, pending] = useActionState(uploadDocument, initial)
  const [fileName, setFileName] = useState<string>('')
  const [autoFilledName, setAutoFilledName] = useState(false)
  const [name, setName] = useState('')
  const f = state.fieldErrors ?? {}
  const parsedTextRef = useRef<HTMLTextAreaElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    if (!autoFilledName || !name) {
      // Strip extension for the user-facing name.
      const dot = file.name.lastIndexOf('.')
      const base = dot > 0 ? file.name.slice(0, dot) : file.name
      setName(base)
      setAutoFilledName(true)
    }
  }

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="file" className="text-sm font-medium text-foreground">
          File <span className="text-destructive">*</span>
        </label>
        <label
          htmlFor="file"
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background px-6 py-8 text-center transition-colors hover:border-primary"
        >
          <Upload className="h-6 w-6 text-muted" aria-hidden />
          <span className="text-sm font-medium text-foreground">
            {fileName ? fileName : 'Click to select a PDF, DOCX, or text file'}
          </span>
          <span className="text-xs text-muted">Up to 50 MB</span>
        </label>
        <input
          id="file"
          name="file"
          type="file"
          required
          className="sr-only"
          accept=".pdf,.docx,.doc,.txt,.md"
          onChange={handleFileChange}
        />
        {f.file ? <p className="text-xs text-destructive">{f.file}</p> : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="name" className="text-sm font-medium text-foreground">
            Display name <span className="text-destructive">*</span>
          </label>
          <Input
            id="name"
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="CC&Rs (2018 amended)"
            error={Boolean(f.name)}
            disabled={pending}
          />
          {f.name ? <p className="text-xs text-destructive">{f.name}</p> : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="type" className="text-sm font-medium text-foreground">
            Type <span className="text-destructive">*</span>
          </label>
          <Select
            id="type"
            name="type"
            required
            defaultValue="ccr"
            disabled={pending}
          >
            {DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          {f.type ? <p className="text-xs text-destructive">{f.type}</p> : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="parsed_text" className="text-sm font-medium text-foreground">
            Plain text (optional)
          </label>
          <AiRewriteButton
            textareaRef={parsedTextRef}
            context="Plain text extracted from a governing document — preserve every section number and legal clause exactly"
            disabled={pending}
          />
        </div>
        <Textarea
          ref={parsedTextRef}
          id="parsed_text"
          name="parsed_text"
          rows={6}
          placeholder="Paste the document's text here so the AI can match violations to specific CC&R sections. You can also fill this in later from the document detail page."
          disabled={pending}
        />
        <p className="text-xs text-muted">
          Phase 1 doesn&apos;t auto-extract text from PDFs. Pasting the contents here unlocks
          Covenant Brain matching in the violation wizard.
        </p>
      </div>

      {state.error ? (
        <Alert variant="error" title="Couldn't upload">
          {state.error}
        </Alert>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button asChild variant="outline" disabled={pending}>
          <Link href="/documents">Cancel</Link>
        </Button>
        <Button type="submit" loading={pending}>
          Upload
        </Button>
      </div>
    </form>
  )
}
