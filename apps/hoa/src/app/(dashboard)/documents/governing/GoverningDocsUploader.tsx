'use client'

import { useState } from 'react'
import { Upload } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Textarea,
} from '@homeowner-portal/ui'

const DOC_TYPES = [
  { value: 'declaration', label: 'Declaration / CC&Rs' },
  { value: 'bylaws', label: 'Bylaws' },
  { value: 'rules', label: 'Rules & Regulations' },
  { value: 'amendment', label: 'Amendment' },
  { value: 'policy', label: 'Policy' },
] as const

interface AssociationOption {
  id: string
  name: string
}

interface UploadSuccess {
  documentId: string
  chunkCount: number
  parserVersion: string
}

interface UploadError {
  error: string
  message?: string
}

export function GoverningDocsUploader({
  associations,
}: {
  associations: AssociationOption[]
}) {
  const [mode, setMode] = useState<'file' | 'paste'>('file')
  const [title, setTitle] = useState('')
  const [docType, setDocType] = useState<(typeof DOC_TYPES)[number]['value']>(
    'declaration',
  )
  const [associationId, setAssociationId] = useState(associations[0]?.id ?? '')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [pastedText, setPastedText] = useState('')
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>(
    'idle',
  )
  const [success, setSuccess] = useState<UploadSuccess | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const canSubmit =
    title.trim().length > 0 &&
    associationId &&
    (mode === 'file' ? file !== null : pastedText.trim().length >= 100) &&
    status !== 'uploading'

  function reset() {
    setTitle('')
    setEffectiveDate('')
    setFile(null)
    setPastedText('')
    setSuccess(null)
    setErrorMessage(null)
    setStatus('idle')
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canSubmit) return
    setStatus('uploading')
    setErrorMessage(null)

    const form = new FormData()
    form.append('title', title.trim())
    form.append('type', docType)
    form.append('associationId', associationId)
    if (effectiveDate) form.append('effectiveDate', effectiveDate)
    if (mode === 'file' && file) {
      form.append('file', file)
    } else if (mode === 'paste') {
      form.append('pastedText', pastedText.trim())
    }

    try {
      const res = await fetch('/api/governing-docs/upload', {
        method: 'POST',
        body: form,
      })
      const json = (await res.json()) as UploadSuccess | UploadError
      if (!res.ok) {
        const err = json as UploadError
        setErrorMessage(err.message ?? err.error)
        setStatus('error')
        return
      }
      setSuccess(json as UploadSuccess)
      setStatus('done')
      // Re-fetch the page server-side via a soft reload so the loaded-docs
      // list updates without losing scroll.
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error')
      setStatus('error')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" />
          Upload a document
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="title" className="text-sm font-medium text-foreground">
                Title
              </label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Association Declaration"
                disabled={status === 'uploading'}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="docType" className="text-sm font-medium text-foreground">
                Document type
              </label>
              <select
                id="docType"
                value={docType}
                onChange={(e) =>
                  setDocType(
                    e.target.value as (typeof DOC_TYPES)[number]['value'],
                  )
                }
                disabled={status === 'uploading'}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {associations.length > 1 ? (
              <div className="space-y-1.5">
                <label
                  htmlFor="associationId"
                  className="text-sm font-medium text-foreground"
                >
                  Association
                </label>
                <select
                  id="associationId"
                  value={associationId}
                  onChange={(e) => setAssociationId(e.target.value)}
                  disabled={status === 'uploading'}
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {associations.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label
                htmlFor="effectiveDate"
                className="text-sm font-medium text-foreground"
              >
                Effective date <span className="text-muted/70">(optional)</span>
              </label>
              <Input
                id="effectiveDate"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                disabled={status === 'uploading'}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div role="tablist" className="flex gap-1 rounded-md bg-foreground/30 p-1">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'file'}
                onClick={() => setMode('file')}
                className={
                  'flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ' +
                  (mode === 'file'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted hover:text-foreground')
                }
              >
                Upload file
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'paste'}
                onClick={() => setMode('paste')}
                className={
                  'flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ' +
                  (mode === 'paste'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted hover:text-foreground')
                }
              >
                Paste text
              </button>
            </div>

            {mode === 'file' ? (
              <div className="space-y-1.5">
                <Input
                  type="file"
                  accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  disabled={status === 'uploading'}
                />
                <p className="text-xs text-muted">
                  PDF, TXT, or Markdown. Max 25 MB. Scanned PDFs without OCR may
                  produce empty text — switch to Paste text in that case.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  rows={10}
                  placeholder="Paste the full text of the document here..."
                  disabled={status === 'uploading'}
                />
                <p className="text-xs text-muted">
                  Minimum 100 characters. Plain text or markdown both work — markdown
                  with ## Article and ### Section headings produces cleaner chunks.
                </p>
              </div>
            )}
          </div>

          {status === 'error' && errorMessage ? (
            <Alert variant="error" title="Upload failed">
              {errorMessage}
            </Alert>
          ) : null}

          {status === 'done' && success ? (
            <Alert variant="success" title="Loaded">
              We found {success.chunkCount}{' '}
              {success.chunkCount === 1 ? 'section' : 'sections'} — you can
              now reference them from the violation wizard and Ask the Docs.
            </Alert>
          ) : null}

          <div className="flex items-center gap-2">
            <Button type="submit" loading={status === 'uploading'} disabled={!canSubmit}>
              {status === 'uploading' ? 'Indexing…' : 'Upload & index'}
            </Button>
            {status === 'done' ? (
              <Button type="button" variant="ghost" onClick={reset}>
                Upload another
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
