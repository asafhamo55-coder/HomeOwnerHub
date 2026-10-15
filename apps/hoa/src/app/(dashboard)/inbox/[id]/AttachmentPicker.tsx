'use client'

import { useRef, useState, useTransition } from 'react'
import { FileText, Paperclip, Upload, X } from 'lucide-react'
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
    // The whole body — including the early size-check rejection below — runs
    // inside this try so `finally` always clears the file input, on every
    // exit path. The browser fires no `change` event when an input's value
    // already equals the re-selected path, so if the reset were skipped on
    // rejection, a user who picks an oversized file, frees up budget by
    // removing another attachment, then re-selects that SAME file would see
    // nothing happen at all: no error, no upload, no feedback.
    try {
      const fits = checkAttachmentFits(attachments, file.size)
      if (!fits.ok) {
        setError(fits.error)
        return
      }
      setError(null)
      setUploading(true)
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
    <div className="space-y-2.5 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">Attachments</span>
        <span className="num text-xs text-muted">{formatBytes(remaining)} left</span>
      </div>

      {attachments.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {attachments.map((file) => (
            <li
              key={file.id}
              className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-subtle py-1 pl-2.5 pr-1 text-xs"
            >
              <Paperclip className="size-3.5 shrink-0 text-muted" aria-hidden />
              <span className="truncate text-foreground">{file.fileName}</span>
              <span className="num shrink-0 text-muted">{formatBytes(file.sizeBytes)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${file.fileName}`}
                onClick={() => remove(file.id)}
                disabled={busy}
                icon={<X aria-hidden />}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void upload(file)
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          loading={uploading}
          disabled={busy}
          icon={<Upload aria-hidden />}
          onClick={() => fileInput.current?.click()}
        >
          Upload a file
        </Button>
        {threadFiles.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            icon={<Paperclip aria-hidden />}
            aria-expanded={open === 'thread'}
            onClick={() => setOpen(open === 'thread' ? null : 'thread')}
          >
            From this thread
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          icon={<FileText aria-hidden />}
          aria-expanded={open === 'library'}
          onClick={() => setOpen(open === 'library' ? null : 'library')}
        >
          From documents
        </Button>
      </div>

      {open === 'thread' ? (
        <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {threadFiles.map((file) => (
            <li key={file.id}>
              <button
                type="button"
                className={PICK_ROW}
                onClick={() => attach('inbox', file.id, file.sizeBytes)}
                disabled={busy}
              >
                <Paperclip className="size-3.5 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{file.fileName}</span>
                <span className="num shrink-0 text-muted">{formatBytes(file.sizeBytes)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open === 'library' ? (
        <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {libraryFiles.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted">No documents uploaded yet.</li>
          ) : (
            libraryFiles.map((file) => (
              <li key={file.id}>
                <button
                  type="button"
                  className={PICK_ROW}
                  onClick={() => attach('document', file.id, file.sizeBytes)}
                  disabled={busy}
                >
                  <FileText className="size-3.5 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="shrink-0 text-muted">{file.type}</span>
                  <span className="num shrink-0 text-muted">{formatBytes(file.sizeBytes)}</span>
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

const PICK_ROW =
  'flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none disabled:opacity-50'
