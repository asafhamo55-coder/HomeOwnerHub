'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Field, Select, useToast } from '@homeowner-portal/ui'
import { attachComplianceEvidence, markComplianceDeadlineDone } from '@/lib/compliance/actions'

export interface EvidenceOption {
  id: string
  name: string
}

/**
 * BL-145 (M5_APPLIED): "Mark as done" with an optional evidence document,
 * or, once done, attach / change / remove the evidence. The page renders
 * this only with the flag on; the server actions re-check everything.
 */
export function EvidenceControls({
  associationId,
  code,
  mode,
  documents,
  currentDocumentId = null,
}: {
  associationId: string
  code: string
  mode: 'mark' | 'attach'
  documents: EvidenceOption[]
  currentDocumentId?: string | null
}) {
  const toast = useToast()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [documentId, setDocumentId] = useState(currentDocumentId ?? '')
  const fieldId = `evidence-${associationId}-${code}`

  function save() {
    startTransition(async () => {
      const res =
        mode === 'mark'
          ? await markComplianceDeadlineDone({ associationId, code, documentId: documentId || null })
          : await attachComplianceEvidence({ associationId, code, documentId: documentId || null })
      if (!res.ok) {
        toast({ tone: 'error', title: 'Not saved', message: res.error })
        return
      }
      toast({
        tone: 'success',
        message: mode === 'mark' ? 'Marked as done.' : documentId ? 'Evidence saved.' : 'Evidence removed.',
      })
      router.refresh()
    })
  }

  const unchanged = mode === 'attach' && (documentId || null) === (currentDocumentId ?? null)

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field
        label="Evidence"
        optional={mode === 'mark'}
        id={fieldId}
        hint={documents.length === 0 ? 'Upload the filing or receipt under Documents first.' : undefined}
        className="min-w-0 max-w-full sm:w-80"
      >
        <Select value={documentId} onValueChange={setDocumentId} disabled={pending}>
          <option value="">{mode === 'mark' ? 'No document' : 'None'}</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="button" size="sm" variant="secondary" onClick={save} disabled={pending || unchanged}>
        {pending ? 'Saving…' : mode === 'mark' ? 'Mark as done' : 'Save evidence'}
      </Button>
    </div>
  )
}
