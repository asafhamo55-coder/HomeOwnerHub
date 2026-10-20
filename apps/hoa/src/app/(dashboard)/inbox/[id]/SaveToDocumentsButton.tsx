'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { FolderInput } from 'lucide-react'
import { Alert, Button, Checkbox, Dialog, DialogContent, DialogTrigger, Field, Input, Select } from '@homeowner-portal/ui'
import { saveAttachmentToDocuments, type SaveAttachmentState } from '@/lib/inbox/attachment-file'
import { GOVERNING_CONFIRM_LABEL, suggestedDocumentName } from '@/lib/inbox/attachment-file-rules'
import { DOCUMENT_TYPE_OPTIONS, isGoverningUploadType, isResidentVisibleType } from '@/lib/documents-rules'

const initial: SaveAttachmentState = {}

/**
 * BL-101 A8 — "Save to documents" on a stored attachment. Files a copy in
 * the documents library under the type the board picks (Other by default).
 * A governing type needs the confirmation tick (M-3). The action gates and
 * validates again, the tick included; this is only the form.
 */
export function SaveToDocumentsButton({
  attachmentId,
  fileName,
}: {
  attachmentId: string
  /** Display and default name only — never logged. */
  fileName: string
}) {
  const [state, action, pending] = useActionState(saveAttachmentToDocuments, initial)
  const [type, setType] = useState<string>('other')
  const f = state.fieldErrors ?? {}

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<FolderInput aria-hidden />}
          // Starts with the visible text so voice control ("click Save to
          // documents") still matches (WCAG 2.5.3 Label in Name).
          aria-label={`Save to documents: ${fileName}`}
        >
          Save to documents
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Save to documents"
        description="Files a copy of this attachment in the documents library. The email keeps its own copy."
      >
        {state.ok && state.documentId ? (
          <Alert variant="success">
            Saved to the documents library.{' '}
            <Link href={`/documents/${state.documentId}`} className="font-medium underline">
              Open document
            </Link>
          </Alert>
        ) : (
          <form action={action} className="space-y-4">
            <input type="hidden" name="attachmentId" value={attachmentId} />
            <Field label="Display name" required error={f.name} hint="“(from email, date)” is added to the name.">
              <Input name="name" required defaultValue={suggestedDocumentName(fileName)} disabled={pending} />
            </Field>
            <Field label="Type" required error={f.type}>
              <Select name="type" value={type} onValueChange={setType} disabled={pending} options={[...DOCUMENT_TYPE_OPTIONS]} />
            </Field>
            {isResidentVisibleType(type) ? (
              <Alert variant="warning">
                Every resident can open CC&R, bylaws and rules documents in the portal. Only file it as this type if
                it’s meant for the whole community.
              </Alert>
            ) : null}
            {isGoverningUploadType(type) ? (
              <div className="space-y-1">
                <Checkbox
                  name="confirmGoverning"
                  label={GOVERNING_CONFIRM_LABEL}
                  description="Anyone can email the board a file. Once confirmed, the AI can quote it as your governing document."
                  error={Boolean(f.confirmGoverning)}
                  disabled={pending}
                />
                {f.confirmGoverning ? <p className="text-sm text-danger" role="alert">{f.confirmGoverning}</p> : null}
              </div>
            ) : null}
            {state.error ? <Alert variant="error">{state.error}</Alert> : null}
            <div className="flex justify-end">
              <Button type="submit" loading={pending} icon={<FolderInput aria-hidden />}>
                Save to documents
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
