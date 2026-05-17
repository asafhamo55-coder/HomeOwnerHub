'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileUp, Trash2 } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, useConfirm, useToast } from '@homeowner-portal/ui'
import { deleteVendorDocument, type VendorDocument } from '@/lib/vendors'

const DOC_TYPE_LABEL: Record<VendorDocument['doc_type'], string> = {
  coi: 'Certificate of Insurance',
  w9: 'W-9',
  license: 'Contractor license',
  contract: 'Contract',
  other: 'Other',
}

interface DocumentUploaderProps {
  vendorId: string
  documents: VendorDocument[]
}

export function DocumentUploader({ vendorId, documents }: DocumentUploaderProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Documents</CardTitle>
        <p className="text-xs text-muted">
          Upload PDFs or images of the COI, W-9, and license. Files are private
          to your HOA. Vision/OCR extraction lands later — until then, fill the
          typed fields below to run the compliance check.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <UploadSlot vendorId={vendorId} docType="coi" label="COI" />
          <UploadSlot vendorId={vendorId} docType="w9" label="W-9" />
          <UploadSlot vendorId={vendorId} docType="license" label="License" />
        </div>

        {documents.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {documents.map((d) => (
              <DocumentRow key={d.id} doc={d} />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted">No documents uploaded yet.</p>
        )}
      </CardContent>
    </Card>
  )
}

function UploadSlot({
  vendorId,
  docType,
  label,
}: {
  vendorId: string
  docType: VendorDocument['doc_type']
  label: string
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setError(null)
    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('docType', docType)

      const res = await fetch(`/api/vendors/${vendorId}/documents`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string
          error?: string
        }
        setError(body.message ?? body.error ?? 'Upload failed.')
        return
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border p-4 text-center">
      <FileUp className="h-5 w-5 text-muted" />
      <span className="text-xs font-medium text-foreground">{label}</span>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
      >
        {isUploading ? 'Uploading…' : 'Choose file'}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

function DocumentRow({ doc }: { doc: VendorDocument }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete this ${DOC_TYPE_LABEL[doc.doc_type]}?`,
      description: 'The file will be removed from storage and the vendor will need to re-upload it.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    setError(null)
    startTransition(async () => {
      const result = await deleteVendorDocument(doc.id)
      if (!result.ok) {
        setError(result.error)
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: `${DOC_TYPE_LABEL[doc.doc_type]} deleted.` })
      router.refresh()
    })
  }

  const filename = doc.storage_path.split('/').slice(-1)[0]

  return (
    <li className="flex items-center justify-between gap-2 rounded-md border border-border bg-foreground/10 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" size="sm">
            {DOC_TYPE_LABEL[doc.doc_type]}
          </Badge>
          <span className="truncate text-xs text-muted">{filename}</span>
        </div>
        <p className="text-xs text-muted">
          {new Date(doc.uploaded_at).toLocaleString()}
          {error ? <span className="ml-2 text-destructive">{error}</span> : null}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleDelete}
        disabled={isPending}
        aria-label="Delete document"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </li>
  )
}
