'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileUp, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  useConfirm,
  useToast,
} from '@homeowner-portal/ui'
import { deleteVendorDocument, type VendorDocument } from '@/lib/vendors'
import { responseErrorMessage } from '@/lib/api/client'

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
      <CardHeader className="pb-4">
        <CardTitle as="h2">Documents</CardTitle>
        <CardDescription>
          PDFs or photos of the COI, W-9 and license. Files are private to your association.
        </CardDescription>
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
          <p className="text-sm text-muted">No documents uploaded yet.</p>
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
        setError(await responseErrorMessage(res, 'Upload failed.'))
        return
      }
      router.refresh()
    } catch {
      setError('Upload failed. Check your connection and try again.')
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong bg-subtle p-4 text-center">
      <FileUp className="size-5 text-muted" aria-hidden />
      <span className="text-sm font-medium text-foreground">{label}</span>
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
        variant="secondary"
        size="sm"
        onClick={() => inputRef.current?.click()}
        loading={isUploading}
        aria-label={`Choose ${label} file`}
      >
        {isUploading ? 'Uploading…' : 'Choose file'}
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
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
    <li className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge variant="neutral" size="sm">
            {DOC_TYPE_LABEL[doc.doc_type]}
          </Badge>
          <span className="truncate text-xs text-muted">{filename}</span>
        </div>
        <p className="text-xs text-muted">
          {new Date(doc.uploaded_at).toLocaleString()}
          {error ? <span className="ml-2 text-danger">{error}</span> : null}
        </p>
      </div>
      <Button
        type="button"
        variant="destructive-ghost"
        size="icon-sm"
        onClick={handleDelete}
        loading={isPending}
        aria-label={`Delete ${DOC_TYPE_LABEL[doc.doc_type]} document`}
        icon={<Trash2 aria-hidden />}
      />
    </li>
  )
}
