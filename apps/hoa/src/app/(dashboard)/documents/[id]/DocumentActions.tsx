'use client'

import { useState, useTransition } from 'react'
import { useFormState } from 'react-dom'
import { Loader2, RotateCcw, Trash2, Upload } from 'lucide-react'
import { Alert, Button, Input } from '@homeowner-portal/ui'
import {
  deleteDocument,
  replaceDocumentFile,
  restoreDocumentVersion,
  type ReplaceActionState,
} from '@/lib/documents'

interface VersionItem {
  id: string
  versionNumber: number
  name: string
  fileSize: number | null
  reason: string | null
  createdAt: string
  downloadUrl: string | null
}

export function DocumentActions({
  documentId,
  versions,
}: {
  documentId: string
  versions: VersionItem[]
}) {
  return (
    <div className="space-y-4">
      <ReplaceForm documentId={documentId} />
      <VersionHistory versions={versions} />
      <DeleteSection documentId={documentId} />
    </div>
  )
}

// ─── replace ─────────────────────────────────────────────────────────

function ReplaceForm({ documentId }: { documentId: string }) {
  const [state, action] = useFormState<ReplaceActionState, FormData>(
    replaceDocumentFile,
    {},
  )
  const [open, setOpen] = useState(false)
  const [filename, setFilename] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set('documentId', documentId)
    startTransition(() => {
      action(formData)
      // useFormState's action returns void on submit; we'll close on
      // the next render when state has no errors. Simpler: just close
      // optimistically — if the action errored, state.error will render.
      setOpen(false)
      setFilename(null)
    })
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Replace file</p>
          <p className="text-xs text-muted">
            Upload a new file (Word, PDF, etc.). The current version is archived to history.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} variant="outline" size="sm">
          <Upload className="h-3.5 w-3.5" />
          Choose file
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Replace file</p>
        <p className="text-xs text-muted">
          New file replaces the current one. Old file stays in version history.
        </p>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-foreground">File</span>
        <input
          type="file"
          name="file"
          required
          disabled={pending}
          onChange={(e) => setFilename(e.target.files?.[0]?.name ?? null)}
          className="mt-1 block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-fg hover:file:bg-primary/90"
        />
        {filename ? <p className="mt-1 text-xs text-muted">{filename}</p> : null}
        {state.fieldErrors?.file ? (
          <p className="mt-1 text-xs text-destructive">{state.fieldErrors.file}</p>
        ) : null}
      </label>

      <label className="block text-sm">
        <span className="font-medium text-foreground">
          Reason <span className="text-muted">(optional)</span>
        </span>
        <Input
          type="text"
          name="reason"
          placeholder="e.g. CC&R amendment 2026-05"
          disabled={pending}
          className="mt-1"
        />
      </label>

      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            setOpen(false)
            setFilename(null)
          }}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Upload new version
        </Button>
      </div>
    </form>
  )
}

// ─── version history ─────────────────────────────────────────────────

function VersionHistory({ versions }: { versions: VersionItem[] }) {
  if (versions.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-foreground">Version history</p>
        <p className="mt-1 text-xs text-muted">
          No prior versions. Replacing the file once will start the history.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border p-4">
        <p className="text-sm font-semibold text-foreground">Version history</p>
        <p className="text-xs text-muted">
          Older versions stay readable. Restore re-points the current document to a prior file.
        </p>
      </div>
      <ul className="divide-y divide-border">
        {versions.map((v) => (
          <VersionRow key={v.id} version={v} />
        ))}
      </ul>
    </div>
  )
}

function bytes(n: number | null): string {
  if (!n) return '—'
  const mb = n / 1024 / 1024
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${(n / 1024).toFixed(0)} KB`
}

function VersionRow({ version }: { version: VersionItem }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleRestore() {
    setError(null)
    if (
      !confirm(
        `Restore version ${version.versionNumber}? The current state is archived first, so this is reversible.`,
      )
    )
      return
    startTransition(async () => {
      const r = await restoreDocumentVersion({ versionId: version.id })
      if (!r.ok) setError(r.error)
      else window.location.reload()
    })
  }

  return (
    <li className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground">
            <span className="font-mono text-xs text-muted">v{version.versionNumber}</span>{' '}
            · {version.name}
          </p>
          <p className="text-xs text-muted">
            {new Date(version.createdAt).toLocaleString()} · {bytes(version.fileSize)}
            {version.reason ? ` · ${version.reason}` : ''}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {version.downloadUrl ? (
            <a
              href={version.downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary hover:underline"
            >
              Download
            </a>
          ) : null}
          <Button onClick={handleRestore} variant="outline" size="sm" disabled={pending}>
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )}
            Restore
          </Button>
        </div>
      </div>
      {error ? <Alert variant="error" className="mt-2 text-xs">{error}</Alert> : null}
    </li>
  )
}

// ─── delete ──────────────────────────────────────────────────────────

function DeleteSection({ documentId }: { documentId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    setError(null)
    if (
      !confirm(
        'Delete this document and every version? The files in storage are also removed and cannot be recovered.',
      )
    )
      return
    startTransition(async () => {
      try {
        await deleteDocument(documentId)
        // deleteDocument redirects to /documents on success — we won't
        // reach the next line. If the server action throws, surface
        // the error.
      } catch (err) {
        setError(err instanceof Error ? err.message : 'delete failed')
      }
    })
  }

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm font-semibold text-destructive">Danger zone</p>
      <p className="mt-1 text-xs text-muted">
        Deletes this document, every prior version row, and every file in storage.
      </p>
      <div className="mt-3 flex justify-end">
        <Button
          onClick={handleDelete}
          variant="outline"
          size="sm"
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          Delete document
        </Button>
      </div>
      {error ? <Alert variant="error" className="mt-2">{error}</Alert> : null}
    </div>
  )
}
