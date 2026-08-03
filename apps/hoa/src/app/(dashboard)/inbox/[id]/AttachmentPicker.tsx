'use client'

import { useRef, useState, useTransition } from 'react'
import { Alert, Button } from '@homeowner-portal/ui'
// The repo's singleton, NOT a bare createBrowserClient — one browser client
// per page load, so we don't add duplicate auth listeners and websocket fanout
// every time the picker mounts.
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  createAttachmentUploadUrl,
  addDraftAttachment,
  removeDraftAttachment,
} from '@/lib/inbox/draft/attachment-actions'
import { checkAttachmentFits, formatBytes, remainingBudget } from '@/lib/inbox/draft/attachments'
import type { DraftAttachment } from '@/lib/inbox/queries'

const BUCKET = 'hoa-documents'

interface Props {
  draftId: string
  attachments: DraftAttachment[]
  /** Files that arrived on this thread. Empty for a new message. */
  threadFiles: Array<{ id: string; fileName: string; sizeBytes: number }>
  libraryFiles: Array<{ id: string; name: string; type: string; sizeBytes: number }>
  disabled?: boolean
}

export function AttachmentPicker({
  draftId,
  attachments,
  threadFiles,
  libraryFiles,
  disabled,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [open, setOpen] = useState<'thread' | 'library' | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const remaining = remainingBudget(attachments)
  const busy = pending || uploading || disabled

  function attach(source: 'inbox' | 'document', ref: string, sizeBytes: number) {
    const fits = checkAttachmentFits(attachments, sizeBytes)
    if (!fits.ok) {
      setError(fits.error)
      return
    }
    setError(null)
    setOpen(null)
    startTransition(async () => {
      const result = await addDraftAttachment(draftId, source, ref)
      if ('error' in result) setError(result.error)
    })
  }

  async function upload(file: File) {
    const fits = checkAttachmentFits(attachments, file.size)
    if (!fits.ok) {
      setError(fits.error)
      return
    }
    setError(null)
    setUploading(true)
    try {
      // Bytes go browser → storage directly. A server action caps its
      // request body at 1MB, so a 15MB file could never pass through one.
      const signed = await createAttachmentUploadUrl(draftId, file.name, file.size)
      if ('error' in signed) {
        setError(signed.error)
        return
      }
      const supabase = getSupabaseBrowserClient()
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(signed.path, signed.token, file)
      if (uploadError) {
        setError('The upload did not finish. Try again.')
        return
      }
      const result = await addDraftAttachment(draftId, 'upload', signed.path, {
        fileName: file.name,
        contentType: file.type || null,
        sizeBytes: file.size,
      })
      if ('error' in result) setError(result.error)
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function remove(attachmentId: string) {
    setError(null)
    startTransition(async () => {
      const result = await removeDraftAttachment(attachmentId)
      if ('error' in result) setError(result.error)
    })
  }

  return (
    <div className="space-y-2 border-t border-border pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Attachments
        </span>
        <span className="text-xs text-muted">{formatBytes(remaining)} left</span>
      </div>

      {attachments.length > 0 ? (
        <ul className="space-y-1">
          {attachments.map((file) => (
            <li key={file.id} className="flex items-center gap-2 text-xs">
              <span className="text-foreground">📎 {file.fileName}</span>
              <span className="text-muted">{formatBytes(file.sizeBytes)}</span>
              <button
                type="button"
                className="text-muted underline"
                onClick={() => remove(file.id)}
                disabled={busy}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void upload(file)
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          loading={uploading}
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          Upload a file
        </Button>
        {threadFiles.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setOpen(open === 'thread' ? null : 'thread')}
          >
            From this thread
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setOpen(open === 'library' ? null : 'library')}
        >
          From documents
        </Button>
      </div>

      {open === 'thread' ? (
        <ul className="rounded-md border border-border p-2">
          {threadFiles.map((file) => (
            <li key={file.id}>
              <button
                type="button"
                className="w-full text-left text-xs underline"
                onClick={() => attach('inbox', file.id, file.sizeBytes)}
                disabled={busy}
              >
                📎 {file.fileName} · {formatBytes(file.sizeBytes)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open === 'library' ? (
        <ul className="max-h-48 overflow-y-auto rounded-md border border-border p-2">
          {libraryFiles.length === 0 ? (
            <li className="text-xs text-muted">No documents uploaded yet.</li>
          ) : (
            libraryFiles.map((file) => (
              <li key={file.id}>
                <button
                  type="button"
                  className="w-full text-left text-xs underline"
                  onClick={() => attach('document', file.id, file.sizeBytes)}
                  disabled={busy}
                >
                  📄 {file.name} · {file.type} · {formatBytes(file.sizeBytes)}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {error ? <Alert variant="error">{error}</Alert> : null}
    </div>
  )
}
