'use client'

import { useState, useTransition } from 'react'
import { useFormState } from 'react-dom'
import { Download, RotateCcw, Trash2, Upload } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  useConfirm,
} from '@homeowner-portal/ui'
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
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle as="h2">Versions</CardTitle>
          <CardDescription>
            Replacing the file keeps the old one here. Restoring archives the current file first, so it is
            reversible.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ReplaceForm documentId={documentId} />
          <VersionHistory versions={versions} />
        </CardContent>
      </Card>
      <DeleteSection documentId={documentId} />
    </div>
  )
}

// ─── replace ─────────────────────────────────────────────────────────

function ReplaceForm({ documentId }: { documentId: string }) {
  const [state, action] = useFormState<ReplaceActionState, FormData>(replaceDocumentFile, {})
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set('documentId', documentId)
    startTransition(() => {
      action(formData)
      // Close optimistically — if the action errored, state.error renders
      // under the reopened button below.
      setOpen(false)
    })
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <Button onClick={() => setOpen(true)} variant="secondary" size="sm" icon={<Upload aria-hidden />}>
          Replace file
        </Button>
        {state.error ? <Alert variant="error">{state.error}</Alert> : null}
        {state.fieldErrors?.file ? <Alert variant="error">{state.fieldErrors.file}</Alert> : null}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-subtle p-4">
      <Field label="New file" required error={state.fieldErrors?.file}>
        <input
          type="file"
          name="file"
          required
          disabled={pending}
          className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-subtle"
        />
      </Field>
      <Field label="Reason" optional>
        <Input type="text" name="reason" placeholder="e.g. CC&R amendment 2026-05" disabled={pending} />
      </Field>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={pending} icon={<Upload aria-hidden />}>
          Upload new version
        </Button>
      </div>
    </form>
  )
}

// ─── version history ─────────────────────────────────────────────────

function VersionHistory({ versions }: { versions: VersionItem[] }) {
  if (versions.length === 0) {
    return <p className="text-sm text-muted">No earlier versions yet.</p>
  }
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {versions.map((v) => (
        <VersionRow key={v.id} version={v} />
      ))}
    </ul>
  )
}

function bytes(n: number | null): string {
  if (!n) return '—'
  const mb = n / 1024 / 1024
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${(n / 1024).toFixed(0)} KB`
}

function VersionRow({ version }: { version: VersionItem }) {
  const confirm = useConfirm()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function handleRestore() {
    setError(null)
    const ok = await confirm({
      title: `Restore version ${version.versionNumber}?`,
      description: 'The current file is archived first, so you can switch back later.',
      confirmLabel: 'Restore',
    })
    if (!ok) return
    startTransition(async () => {
      const r = await restoreDocumentVersion({ versionId: version.id })
      if (!r.ok) setError(r.error)
      else window.location.reload()
    })
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground">
            <span className="num font-medium">v{version.versionNumber}</span>
            <span className="text-muted"> · </span>
            {version.name}
          </p>
          <p className="num text-xs text-muted">
            {new Date(version.createdAt).toLocaleString()} · {bytes(version.fileSize)}
            {version.reason ? ` · ${version.reason}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {version.downloadUrl ? (
            <Button asChild variant="ghost" size="sm" icon={<Download aria-hidden />}>
              <a href={version.downloadUrl} target="_blank" rel="noreferrer">
                Download
              </a>
            </Button>
          ) : null}
          <Button onClick={handleRestore} variant="ghost" size="sm" loading={pending} icon={<RotateCcw aria-hidden />}>
            Restore
          </Button>
        </div>
      </div>
      {error ? (
        <Alert variant="error" className="mt-2">
          {error}
        </Alert>
      ) : null}
    </li>
  )
}

// ─── delete ──────────────────────────────────────────────────────────

function DeleteSection({ documentId }: { documentId: string }) {
  const confirm = useConfirm()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function handleDelete() {
    setError(null)
    const ok = await confirm({
      title: 'Delete this document?',
      description:
        'This removes the document, every earlier version and the files in storage. It cannot be undone.',
      confirmLabel: 'Delete document',
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      try {
        // deleteDocument redirects to /documents on success.
        await deleteDocument(documentId)
      } catch {
        setError('Couldn’t delete the document. Try again.')
      }
    })
  }

  return (
    <Card className="border-danger/30">
      <CardHeader
        className="pb-4"
        actions={
          <Button
            onClick={handleDelete}
            variant="destructive-ghost"
            size="sm"
            loading={pending}
            icon={<Trash2 aria-hidden />}
          >
            Delete document
          </Button>
        }
      >
        <CardTitle as="h2">Delete document</CardTitle>
        <CardDescription>Removes the document, every earlier version and the stored files.</CardDescription>
      </CardHeader>
      {error ? (
        <CardContent>
          <Alert variant="error">{error}</Alert>
        </CardContent>
      ) : null}
    </Card>
  )
}
