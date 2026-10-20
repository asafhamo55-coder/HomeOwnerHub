'use client'

import { useActionState, useRef, useState } from 'react'
import Link from 'next/link'
import { Upload } from 'lucide-react'
import { Alert, Button, Field, Input, Select, Textarea } from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import { uploadDocument, type UploadActionState } from '@/lib/documents'
import { DOCUMENT_ACCEPT, DOCUMENT_TYPE_OPTIONS } from '@/lib/documents-rules'

const initial: UploadActionState = {}

const DOC_TYPES = DOCUMENT_TYPE_OPTIONS

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
      <Field label="File" required error={f.file} hint="PDF, DOCX or text, up to 50 MB.">
        {(control) => (
          <label
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-subtle px-6 py-8 text-center transition-colors duration-fast hover:border-primary focus-within:ring-2 focus-within:ring-ring"
          >
            <Upload className="size-6 text-muted" aria-hidden />
            <span className="text-sm font-medium text-foreground">
              {fileName ? fileName : 'Choose a file to upload'}
            </span>
            <input
              {...control}
              name="file"
              type="file"
              required
              className="sr-only"
              accept={DOCUMENT_ACCEPT}
              onChange={handleFileChange}
            />
          </label>
        )}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Display name" required error={f.name}>
          <Input
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="CC&Rs (2018 amended)"
            disabled={pending}
          />
        </Field>
        <Field label="Type" required error={f.type}>
          <Select name="type" required defaultValue="ccr" disabled={pending}>
            {DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Document text"
        optional
        hint="Paste the text so violations can cite specific sections. You can also add it later from the document page."
        labelAside={
          <AiRewriteButton
            textareaRef={parsedTextRef}
            context="Plain text extracted from a governing document — preserve every section number and legal clause exactly"
            disabled={pending}
          />
        }
      >
        <Textarea ref={parsedTextRef} name="parsed_text" rows={6} disabled={pending} />
      </Field>

      {state.error ? (
        <Alert variant="error" title="Couldn’t upload">
          {state.error}
        </Alert>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button asChild variant="ghost" disabled={pending}>
          <Link href="/documents">Cancel</Link>
        </Button>
        <Button type="submit" loading={pending} icon={<Upload aria-hidden />}>
          Upload
        </Button>
      </div>
    </form>
  )
}
