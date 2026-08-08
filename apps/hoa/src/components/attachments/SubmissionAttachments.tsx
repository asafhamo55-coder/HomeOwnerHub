'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Download, FileText, Image as ImageIcon, Paperclip, Trash2 } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import {
  deleteSubmissionAttachment,
  type SubmissionAttachment,
  type ThreadType,
} from '@/lib/submission-attachments'
import { uploadAttachmentDirect } from '@/lib/upload-attachment'

const ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.webp,.heic,.gif,.doc,.docx,.xls,.xlsx,application/pdf,image/*'

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function SubmissionAttachments({
  threadType,
  parentId,
  attachments,
  canDelete = false,
}: {
  threadType: ThreadType
  parentId: string
  attachments: SubmissionAttachment[]
  canDelete?: boolean
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    startTransition(async () => {
      // Browser-to-Supabase, not through a server action: Vercel caps
      // server-action request bodies at 4.5 MB, which silently rejected
      // every real phone photo attached here.
      const result = await uploadAttachmentDirect(threadType, parentId, file)
      if (inputRef.current) inputRef.current.value = ''
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  function onDelete(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await deleteSubmissionAttachment(id)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {attachments.length === 0 ? (
        <p className="text-sm text-muted">No documents attached yet.</p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((a) => {
            const isImage = (a.contentType ?? '').startsWith('image/')
            return (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-foreground/5 text-muted">
                  {isImage ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.fileName}</p>
                  <p className="text-xs text-muted">
                    {a.uploadedByRole === 'resident' ? 'Resident' : 'Board'}
                    {formatBytes(a.sizeBytes) ? ` · ${formatBytes(a.sizeBytes)}` : ''}
                  </p>
                </div>
                {a.signedUrl ? (
                  <a
                    href={a.signedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-primary hover:bg-foreground/5"
                  >
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">Download</span>
                  </a>
                ) : (
                  <span className="text-xs text-muted">unavailable</span>
                )}
                {canDelete ? (
                  <button
                    type="button"
                    onClick={() => onDelete(a.id)}
                    disabled={isPending}
                    aria-label={`Remove ${a.fileName}`}
                    className="rounded-md p-1.5 text-muted hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={onPick}
          disabled={isPending}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={isPending}
        >
          <Paperclip className="h-4 w-4" />
          {isPending ? 'Uploading…' : 'Attach document'}
        </Button>
        <p className="mt-1.5 text-xs text-muted">PDF, image, or Word/Excel · up to 10 MB</p>
      </div>
    </div>
  )
}
