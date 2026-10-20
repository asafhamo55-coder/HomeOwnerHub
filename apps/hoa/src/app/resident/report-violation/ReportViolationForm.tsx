'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Alert, Button, Field, Input, Select, Textarea } from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import {
  createViolationReport,
  type ViolationCategory,
} from '@/lib/resident-submissions'
import { summarizePhotoUploads, type PhotoUploadOutcome } from '@/lib/attachment-rules'
import { uploadAttachmentDirect } from '@/lib/upload-attachment'
import { PhotoPicker } from './PhotoPicker'
import { trackEvent } from '@/lib/analytics/track'
import { VIOLATION_CATEGORIES } from '@/lib/violation-categories'

const CATEGORIES = VIOLATION_CATEGORIES

export function ReportViolationForm({
  defaultDescription,
}: {
  defaultDescription?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState(false)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const [photos, setPhotos] = useState<File[]>([])
  const [photoWarning, setPhotoWarning] = useState<string | null>(null)
  const [reportId, setReportId] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    setError(null)
    setFieldErrors({})
    setSuccess(false)
    setPhotoWarning(null)

    const category = String(formData.get('category') ?? '') as ViolationCategory
    const description = String(formData.get('description') ?? '').trim()
    const aboutAddress = String(formData.get('about_address') ?? '').trim()
    const occurredAt = String(formData.get('occurred_at') ?? '').trim() || null

    startTransition(async () => {
      const result = await createViolationReport({
        category,
        description,
        aboutAddress,
        occurredAt,
      })
      if (!result.ok) {
        if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) setFieldErrors(result.fieldErrors)
        else setError(result.error)
        return
      }

      trackEvent('resident.request_submitted', { type: 'violation_report' })
      const newReportId = result.data.reportId
      setReportId(newReportId)

      // Photos upload only after the report exists — the attachment row
      // needs a parentId. Sequential, not parallel: a resident on mobile data
      // uploading four photos at once is how you get four timeouts instead of
      // four uploads.
      //
      // `uploadAttachmentDirect` sends the bytes browser-to-Supabase rather
      // than through a server action. Vercel caps server-action bodies at
      // 4.5 MB and a phone photo is 3-6 MB, which is why the original
      // implementation failed in production on real camera photos.
      const outcomes: PhotoUploadOutcome[] = []
      for (const file of photos) {
        try {
          const uploaded = await uploadAttachmentDirect('concern', newReportId, file)
          if (!uploaded.ok) {
            console.error(`Photo upload failed for ${file.name}: ${uploaded.error}`)
          }
          outcomes.push({ name: file.name, ok: uploaded.ok })
        } catch (err) {
          // A thrown upload (network drop, 413, server exception) must still
          // land in the same summary path as a returned failure — otherwise
          // the resident sees no success, no warning, no error, and refiles
          // a duplicate report.
          console.error(`Photo upload threw for ${file.name}:`, err)
          outcomes.push({ name: file.name, ok: false })
        }
      }

      const summary = summarizePhotoUploads(outcomes)
      setSuccess(true)

      if (summary.allSucceeded) {
        // Land the resident on the concern's tracking page so they can follow
        // the board's decision and message back.
        setTimeout(() => router.push(`/resident/violations/${newReportId}`), 1200)
        return
      }

      // Do NOT auto-redirect past a message the resident needs to read. The
      // report is saved either way; they choose when to move on.
      setPhotoWarning(summary.message)
    })
  }

  return (
    <form action={handleSubmit} className="space-y-5" noValidate>
      {error ? <Alert variant="error" title="Couldn’t send your report">{error}</Alert> : null}

      <Field label="What kind of issue?" required error={fieldErrors.category}>
        <Select name="category" placeholder="Choose one…">
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Address or location"
        required
        error={fieldErrors.about_address}
        hint="Street address, unit, or a description like “common area near the pool”."
      >
        <Input name="about_address" maxLength={300} />
      </Field>

      <Field label="When did it happen?" optional hint="Approximate is fine." error={fieldErrors.occurred_at}>
        <Input name="occurred_at" type="datetime-local" />
      </Field>

      <Field
        label="What did you observe?"
        required
        error={fieldErrors.description}
        hint="Just the facts — what, when, how often. Avoid speculation. At least 20 characters."
        labelAside={
          <AiRewriteButton
            textareaRef={descriptionRef}
            context="Resident-submitted violation report — preserve facts, dates, and times exactly; avoid speculation or accusations"
            disabled={isPending}
          />
        }
      >
        <Textarea ref={descriptionRef} name="description" rows={6} maxLength={4000} defaultValue={defaultDescription} />
      </Field>

      <Field label="Photos" optional hint="Photos help the board act without a follow-up visit. Up to 10 MB each.">
        {(control) => (
          <div id={control.id} aria-describedby={control['aria-describedby']}>
            <PhotoPicker files={photos} onChange={setPhotos} disabled={isPending} />
          </div>
        )}
      </Field>

      {success && !photoWarning ? (
        <Alert variant="success" title="Report sent">
          Taking you to your report…
        </Alert>
      ) : null}
      {photoWarning && reportId ? (
        <Alert
          variant="warning"
          title="Report saved, but some photos didn’t upload"
          actions={
            <Button type="button" variant="secondary" size="sm" onClick={() => router.push(`/resident/violations/${reportId}`)}>
              Go to report
            </Button>
          }
        >
          {photoWarning}
        </Alert>
      ) : null}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={isPending} disabled={success} icon={<Send aria-hidden />}>
          Send report
        </Button>
      </div>
    </form>
  )
}
