# Resident Violation Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a resident attach photos to a violation report at the moment they submit it, from a phone, with the camera one tap away.

**Architecture:** The upload action requires an existing `parentId`, but the form creates the report on submit — so the order is create-then-upload. Files are held in React state until `createViolationReport` returns a `reportId`, then uploaded one at a time against the existing `('concern', reportId)` attachment path. If a photo fails, the report still stands and the resident is told which ones to re-add. All validation and message-building logic is extracted into a pure, unit-tested module, because this repo's vitest harness is node-only and cannot render components.

**Tech Stack:** Next.js App Router (server actions), React 19 client components, TypeScript, Zod (server side, already in place), Supabase Storage, vitest.

## Global Constraints

- **Prefix every shell command with `rtk`**, including inside `&&` chains — per `CLAUDE.md`. e.g. `rtk git commit`, `rtk pnpm test:unit`.
- **No new dependencies.** No testing-library, no jsdom, no image library. This change adds zero packages.
- **UI comes from `@homeowner-portal/ui`** (`Button`, `Input`, `Select`, `Textarea`) and existing Tailwind tokens. No new components libraries, no new color tokens.
- **No migration, no schema change.** `submission_attachments` (migration `0027`), the `hoa-documents` bucket, and thread type `'concern'` all already exist.
- **vitest is node-only and pure-modules-only** (`vitest.config.ts`). Tests may not import Supabase, Next server components, or anything touching the network. Test files live beside their source as `*.test.ts` under `apps/**/src/**`.
- **Attachment limits are 10 MB and the existing MIME allowlist** — do not invent new values; move the existing ones.
- **No PII in any test fixture or console output** — use fixture names like `photo-1.jpg`, never real addresses or resident names.

---

### Task 1: Extract attachment rules into a pure, testable module

`submission-attachments.ts` carries `'use server'`, so Next permits only async function exports from it. `MAX_BYTES` and `ALLOWED_TYPES` therefore cannot be imported by the client picker from where they live today. Move them to a plain module and re-import them, keeping one source of truth.

**Files:**
- Create: `apps/hoa/src/lib/attachment-rules.ts`
- Create: `apps/hoa/src/lib/attachment-rules.test.ts`
- Modify: `apps/hoa/src/lib/submission-attachments.ts:12-25` (delete the local constants, import them instead)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `ATTACHMENT_MAX_BYTES: number`
  - `ATTACHMENT_ALLOWED_TYPES: ReadonlySet<string>`
  - `PHOTO_ALLOWED_TYPES: ReadonlySet<string>`
  - `PHOTO_ACCEPT: string`
  - `interface PickedFile { name: string; size: number; type: string }`
  - `function validatePhotoFiles<T extends PickedFile>(files: readonly T[]): { accepted: T[]; rejected: Array<{ name: string; reason: string }> }`

- [ ] **Step 1: Write the failing test**

Create `apps/hoa/src/lib/attachment-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  ATTACHMENT_MAX_BYTES,
  PHOTO_ACCEPT,
  validatePhotoFiles,
} from './attachment-rules'

// `validatePhotoFiles` is deliberately typed against a structural
// `PickedFile` rather than the DOM `File`, so it is testable under
// vitest's node environment (where `File` is not reliably global) while
// a real `File` still satisfies it at the call site.
const ok = { name: 'photo-1.jpg', size: 2_000_000, type: 'image/jpeg' }

describe('validatePhotoFiles', () => {
  it('accepts a normal phone photo', () => {
    expect(validatePhotoFiles([ok])).toEqual({ accepted: [ok], rejected: [] })
  })

  it('accepts HEIC, which is what iPhones actually produce', () => {
    const heic = { name: 'IMG_0042.HEIC', size: 3_500_000, type: 'image/heic' }
    expect(validatePhotoFiles([heic]).accepted).toEqual([heic])
  })

  it('rejects a file over the limit and names it', () => {
    const huge = { name: 'raw.dng', size: ATTACHMENT_MAX_BYTES + 1, type: 'image/jpeg' }
    expect(validatePhotoFiles([huge])).toEqual({
      accepted: [],
      rejected: [{ name: 'raw.dng', reason: 'Over the 10 MB limit' }],
    })
  })

  it('accepts a file exactly at the limit', () => {
    const edge = { name: 'edge.jpg', size: ATTACHMENT_MAX_BYTES, type: 'image/jpeg' }
    expect(validatePhotoFiles([edge]).accepted).toEqual([edge])
  })

  it('rejects a non-image even though the server allows it as an attachment', () => {
    const pdf = { name: 'notice.pdf', size: 1000, type: 'application/pdf' }
    expect(validatePhotoFiles([pdf])).toEqual({
      accepted: [],
      rejected: [{ name: 'notice.pdf', reason: 'Not a supported image' }],
    })
  })

  it('rejects an empty file, which the server would reject anyway', () => {
    const empty = { name: 'empty.jpg', size: 0, type: 'image/jpeg' }
    expect(validatePhotoFiles([empty]).rejected).toEqual([
      { name: 'empty.jpg', reason: 'File is empty' },
    ])
  })

  it('partitions a mixed batch, preserving order', () => {
    const big = { name: 'big.jpg', size: ATTACHMENT_MAX_BYTES + 1, type: 'image/jpeg' }
    const second = { name: 'photo-2.png', size: 500, type: 'image/png' }
    const result = validatePhotoFiles([ok, big, second])
    expect(result.accepted).toEqual([ok, second])
    expect(result.rejected).toEqual([{ name: 'big.jpg', reason: 'Over the 10 MB limit' }])
  })

  it('handles an empty selection', () => {
    expect(validatePhotoFiles([])).toEqual({ accepted: [], rejected: [] })
  })

  it('PHOTO_ACCEPT lists only image types, for the file input', () => {
    expect(PHOTO_ACCEPT.split(',').every((t) => t.startsWith('image/'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pnpm vitest run apps/hoa/src/lib/attachment-rules.test.ts`
Expected: FAIL — `Failed to resolve import "./attachment-rules"`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/hoa/src/lib/attachment-rules.ts`:

```ts
// Plain module — deliberately NOT 'use server'. `submission-attachments.ts`
// carries 'use server', and Next only permits async function exports from
// such a module, so its limits cannot be imported by a client component
// from there. These constants live here and are imported by both sides,
// keeping one source of truth for what the server will actually accept.

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024 // 10 MB

/** Everything the submission-attachment server action accepts. */
export const ATTACHMENT_ALLOWED_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

/**
 * The image-only subset, for the report-time photo picker. A resident
 * reporting what they are standing in front of is attaching a photo, not
 * a spreadsheet — offering the full set here would invite confusion.
 * `image/heic` matters: it is what an iPhone produces by default.
 */
export const PHOTO_ALLOWED_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/gif',
])

/** `accept` attribute value for the photo file inputs. */
export const PHOTO_ACCEPT = Array.from(PHOTO_ALLOWED_TYPES).join(',')

/** Structural stand-in for the DOM `File`, so this module stays node-testable. */
export interface PickedFile {
  name: string
  size: number
  type: string
}

export interface PhotoValidation<T> {
  accepted: T[]
  rejected: Array<{ name: string; reason: string }>
}

/**
 * Client-side courtesy check, not a control. The server re-validates in
 * `uploadSubmissionAttachment`; this exists so an oversized photo fails
 * instantly instead of after a slow upload over mobile data.
 */
export function validatePhotoFiles<T extends PickedFile>(
  files: readonly T[],
): PhotoValidation<T> {
  const accepted: T[] = []
  const rejected: Array<{ name: string; reason: string }> = []

  for (const file of files) {
    if (file.size === 0) {
      rejected.push({ name: file.name, reason: 'File is empty' })
    } else if (file.size > ATTACHMENT_MAX_BYTES) {
      rejected.push({ name: file.name, reason: 'Over the 10 MB limit' })
    } else if (!PHOTO_ALLOWED_TYPES.has(file.type)) {
      rejected.push({ name: file.name, reason: 'Not a supported image' })
    } else {
      accepted.push(file)
    }
  }

  return { accepted, rejected }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk pnpm vitest run apps/hoa/src/lib/attachment-rules.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Rewire the server action to the shared constants**

In `apps/hoa/src/lib/submission-attachments.ts`, delete lines 12-25 (the local `BUCKET` stays; `MAX_BYTES` and `ALLOWED_TYPES` go) and replace with:

```ts
import { ATTACHMENT_ALLOWED_TYPES, ATTACHMENT_MAX_BYTES } from '@/lib/attachment-rules'

// Attachments reuse the existing private `hoa-documents` bucket (see
// 0003_storage_policies.sql). Metadata lives in submission_attachments
// (0027). Files are stored under {org}/submissions/{thread}/{parent}/...
// Size and type limits live in attachment-rules.ts so the client picker
// can share them — this module is 'use server' and cannot export them.
const BUCKET = 'hoa-documents'
```

Then update the two usages so the behavior is unchanged:
- Line 119: `if (file.size > MAX_BYTES) {` → `if (file.size > ATTACHMENT_MAX_BYTES) {`
- Line 122: `if (file.type && !ALLOWED_TYPES.has(file.type)) {` → `if (file.type && !ATTACHMENT_ALLOWED_TYPES.has(file.type)) {`

Leave the error message strings exactly as they are.

- [ ] **Step 6: Verify nothing else referenced the old names**

Run: `rtk grep -n "MAX_BYTES\|ALLOWED_TYPES" apps/hoa/src/lib/submission-attachments.ts`
Expected: only the two `ATTACHMENT_`-prefixed usages and the import line.

- [ ] **Step 7: Typecheck and run the full unit suite**

Run: `rtk pnpm typecheck && rtk pnpm test:unit`
Expected: typecheck clean; all tests pass including the 9 new ones.

- [ ] **Step 8: Commit**

```bash
rtk git add apps/hoa/src/lib/attachment-rules.ts apps/hoa/src/lib/attachment-rules.test.ts apps/hoa/src/lib/submission-attachments.ts
rtk git commit -m "refactor(hoa): move attachment limits into a shared, testable module

submission-attachments.ts is 'use server', so Next permits only async
function exports — its size and type limits could not be imported by a
client component. They move to attachment-rules.ts, which also gains the
image-only subset and the pure validator the photo picker needs."
```

---

### Task 2: Summarize per-photo upload outcomes

When a report saves but two of four photos fail, the resident must be told plainly that the report went through and exactly which photos to re-add. That message-building is pure logic, so it is written and tested on its own.

**Files:**
- Modify: `apps/hoa/src/lib/attachment-rules.ts` (append)
- Modify: `apps/hoa/src/lib/attachment-rules.test.ts` (append)

**Interfaces:**
- Consumes: nothing from Task 1 at runtime; shares the module.
- Produces:
  - `interface PhotoUploadOutcome { name: string; ok: boolean }`
  - `interface PhotoUploadSummary { allSucceeded: boolean; failedNames: string[]; message: string | null }`
  - `function summarizePhotoUploads(outcomes: readonly PhotoUploadOutcome[]): PhotoUploadSummary`

- [ ] **Step 1: Write the failing test**

Append to `apps/hoa/src/lib/attachment-rules.test.ts`:

```ts
import { summarizePhotoUploads } from './attachment-rules'

describe('summarizePhotoUploads', () => {
  it('says nothing when no photos were attached', () => {
    expect(summarizePhotoUploads([])).toEqual({
      allSucceeded: true,
      failedNames: [],
      message: null,
    })
  })

  it('says nothing when every photo uploaded', () => {
    expect(
      summarizePhotoUploads([
        { name: 'photo-1.jpg', ok: true },
        { name: 'photo-2.jpg', ok: true },
      ]),
    ).toEqual({ allSucceeded: true, failedNames: [], message: null })
  })

  it('leads with the report being saved when one photo fails', () => {
    const result = summarizePhotoUploads([{ name: 'photo-1.jpg', ok: false }])
    expect(result.allSucceeded).toBe(false)
    expect(result.failedNames).toEqual(['photo-1.jpg'])
    expect(result.message).toBe(
      'Your report was submitted. 1 photo did not upload (photo-1.jpg) — you can add it from the report page.',
    )
  })

  it('pluralizes and lists every failure', () => {
    const result = summarizePhotoUploads([
      { name: 'photo-1.jpg', ok: true },
      { name: 'photo-2.jpg', ok: false },
      { name: 'photo-3.heic', ok: false },
    ])
    expect(result.failedNames).toEqual(['photo-2.jpg', 'photo-3.heic'])
    expect(result.message).toBe(
      'Your report was submitted. 2 photos did not upload (photo-2.jpg, photo-3.heic) — you can add them from the report page.',
    )
  })

  it('never reports failure when the list is all successes, regardless of length', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ name: `photo-${i}.jpg`, ok: true }))
    expect(summarizePhotoUploads(many).allSucceeded).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pnpm vitest run apps/hoa/src/lib/attachment-rules.test.ts`
Expected: FAIL — `summarizePhotoUploads is not a function` / no matching export.

- [ ] **Step 3: Write minimal implementation**

Append to `apps/hoa/src/lib/attachment-rules.ts`:

```ts
export interface PhotoUploadOutcome {
  name: string
  ok: boolean
}

export interface PhotoUploadSummary {
  allSucceeded: boolean
  failedNames: string[]
  /** Null when there is nothing worth telling the resident. */
  message: string | null
}

/**
 * The report is created before its photos upload, so a photo failure never
 * means the report was lost. The message leads with that fact — a resident
 * who reads "did not upload" first will assume they have to start over,
 * and will either refile a duplicate or give up.
 */
export function summarizePhotoUploads(
  outcomes: readonly PhotoUploadOutcome[],
): PhotoUploadSummary {
  const failedNames = outcomes.filter((o) => !o.ok).map((o) => o.name)
  if (failedNames.length === 0) {
    return { allSucceeded: true, failedNames: [], message: null }
  }

  const count = failedNames.length
  const noun = count === 1 ? 'photo' : 'photos'
  const object = count === 1 ? 'it' : 'them'
  return {
    allSucceeded: false,
    failedNames,
    message:
      `Your report was submitted. ${count} ${noun} did not upload ` +
      `(${failedNames.join(', ')}) — you can add ${object} from the report page.`,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk pnpm vitest run apps/hoa/src/lib/attachment-rules.test.ts`
Expected: PASS, 14 tests total.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/hoa/src/lib/attachment-rules.ts apps/hoa/src/lib/attachment-rules.test.ts
rtk git commit -m "feat(hoa): summarize per-photo upload outcomes

The report is created before its photos upload, so a photo failure never
means the report was lost. The message says so first — otherwise a
resident assumes they must start over and files a duplicate."
```

---

### Task 3: Photo picker component

A self-contained client component owning selection state, previews, and removal. It is kept out of `ReportViolationForm.tsx` because that file is already 165 lines and this is a distinct responsibility.

Two separate inputs by design: on iOS, `capture` forces the camera *and* disables library multi-select, so a single input cannot offer both. "Take photo" captures one shot directly; "Add from library" picks several.

**Files:**
- Create: `apps/hoa/src/app/resident/report-violation/PhotoPicker.tsx`

**Interfaces:**
- Consumes: `PHOTO_ACCEPT`, `validatePhotoFiles` from `@/lib/attachment-rules` (Task 1).
- Produces: `function PhotoPicker(props: { files: File[]; onChange: (files: File[]) => void; disabled?: boolean }): JSX.Element`

- [ ] **Step 1: Write the component**

Create `apps/hoa/src/app/resident/report-violation/PhotoPicker.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, X } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { PHOTO_ACCEPT, validatePhotoFiles } from '@/lib/attachment-rules'

// Two inputs, not one. On iOS `capture` opens the camera directly but also
// disables picking several images from the library, so a single input
// cannot offer both. "Take photo" is the walk-through path (one shot, rear
// camera); "Add from library" is the multi-select path. On desktop
// `capture` is ignored and both fall back to the file dialog.

export function PhotoPicker({
  files,
  onChange,
  disabled = false,
}: {
  files: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const [rejected, setRejected] = useState<Array<{ name: string; reason: string }>>([])
  const [previews, setPreviews] = useState<string[]>([])

  // Object URLs are leaked unless explicitly revoked. Rebuild the whole
  // list whenever `files` changes and revoke the previous batch.
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f))
    setPreviews(urls)
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [files])

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    // Reset immediately so picking the same file twice still fires onChange.
    e.target.value = ''
    if (picked.length === 0) return

    const { accepted, rejected: bad } = validatePhotoFiles(picked)
    setRejected(bad)
    if (accepted.length > 0) onChange([...files, ...accepted])
  }

  function removeAt(index: number) {
    onChange(files.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <input
        ref={cameraRef}
        type="file"
        accept={PHOTO_ACCEPT}
        capture="environment"
        className="hidden"
        onChange={handlePick}
      />
      <input
        ref={libraryRef}
        type="file"
        accept={PHOTO_ACCEPT}
        multiple
        className="hidden"
        onChange={handlePick}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => cameraRef.current?.click()}
        >
          <Camera className="h-4 w-4" />
          Take photo
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => libraryRef.current?.click()}
        >
          <ImagePlus className="h-4 w-4" />
          Add from library
        </Button>
      </div>

      {files.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL, not a remote asset */}
              <img
                src={previews[i]}
                alt={file.name}
                className="h-20 w-20 rounded-md border border-border object-cover"
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeAt(i)}
                aria-label={`Remove ${file.name}`}
                className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-surface p-0.5 text-muted shadow-sm hover:text-foreground disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {rejected.length > 0 ? (
        <ul className="space-y-0.5 text-xs text-destructive">
          {rejected.map((r) => (
            <li key={r.name}>
              {r.name} — {r.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `rtk pnpm typecheck`
Expected: clean. If `capture` is rejected on the input, confirm React types are current — it is a valid React DOM attribute.

- [ ] **Step 3: Lint**

Run: `rtk pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/hoa/src/app/resident/report-violation/PhotoPicker.tsx
rtk git commit -m "feat(hoa): photo picker for resident violation reports

Two inputs rather than one: on iOS 'capture' opens the camera directly
but also disables library multi-select, so a single input cannot offer
both. Object URLs are revoked on change to avoid leaking previews."
```

---

### Task 4: Wire photos into the report form

Create the report first, then upload each held photo against the returned id. On partial failure, keep the resident on the page with a message rather than redirecting past it.

**Files:**
- Modify: `apps/hoa/src/app/resident/report-violation/ReportViolationForm.tsx`
- Modify: `docs/superpowers/specs/2026-08-02-resident-violation-photos-design.md` (§6 testing, to match the harness that actually exists)

**Interfaces:**
- Consumes: `PhotoPicker` (Task 3), `summarizePhotoUploads` (Task 2), and the existing `uploadSubmissionAttachment` server action.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add imports and photo state**

In `ReportViolationForm.tsx`, extend the imports:

```tsx
import { summarizePhotoUploads, type PhotoUploadOutcome } from '@/lib/attachment-rules'
import { uploadSubmissionAttachment } from '@/lib/submission-attachments'
import { PhotoPicker } from './PhotoPicker'
```

Then add state beside the existing hooks (after line 34's `descriptionRef`):

```tsx
  const [photos, setPhotos] = useState<File[]>([])
  const [photoWarning, setPhotoWarning] = useState<string | null>(null)
  const [reportId, setReportId] = useState<string | null>(null)
```

- [ ] **Step 2: Replace `handleSubmit` with the create-then-upload flow**

Replace the whole `handleSubmit` body (lines 36-61) with:

```tsx
  async function handleSubmit(formData: FormData) {
    setError(null)
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
        setError(result.error)
        return
      }

      const newReportId = result.data.reportId
      setReportId(newReportId)

      // Photos upload only after the report exists — `uploadSubmissionAttachment`
      // needs a parentId. Sequential, not parallel: a resident on mobile data
      // uploading four photos at once is how you get four timeouts instead of
      // four uploads.
      const outcomes: PhotoUploadOutcome[] = []
      for (const file of photos) {
        const fd = new FormData()
        fd.set('threadType', 'concern')
        fd.set('parentId', newReportId)
        fd.set('file', file)
        const uploaded = await uploadSubmissionAttachment(fd)
        outcomes.push({ name: file.name, ok: uploaded.ok })
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
```

- [ ] **Step 3: Add the photo field to the form**

Insert a new `Field` immediately after the description `Field` (after line 117's closing `</Field>`):

```tsx
      <Field label="Photos">
        <PhotoPicker files={photos} onChange={setPhotos} disabled={isPending} />
        <Helper>
          Optional. Photos help the board act on the report without a
          follow-up visit. Up to 10 MB each.
        </Helper>
      </Field>
```

- [ ] **Step 4: Remove the now-false copy**

The description helper currently ends with "Photos can be emailed to the board separately." — that instruction is wrong once the form accepts photos. In the `Field label="What did you observe?"` helper (lines 113-116), delete that sentence, leaving:

```tsx
        <Helper>
          Stick to what you observed. Avoid speculation or accusations.
        </Helper>
```

- [ ] **Step 5: Show the partial-failure message**

Replace the success block (lines 124-128) with:

```tsx
      {success && !photoWarning ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Report submitted. Redirecting…
        </p>
      ) : null}
      {photoWarning && reportId ? (
        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p>{photoWarning}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/resident/violations/${reportId}`)}
          >
            Go to report
          </Button>
        </div>
      ) : null}
```

- [ ] **Step 6: Typecheck, lint, and run the unit suite**

Run: `rtk pnpm typecheck && rtk pnpm lint && rtk pnpm test:unit`
Expected: all clean; 14 attachment-rules tests still pass.

- [ ] **Step 7: Manual verification**

There is no component test harness in this repo — `vitest.config.ts` is `environment: 'node'` and scoped to pure modules, and no Playwright config exists. These cases must therefore be checked by hand.

Run `rtk pnpm dev:hoa`, sign in as a resident, and go to `/resident/report-violation`:

1. **Regression, most important:** submit a report with **no** photos. It saves and redirects to the report page exactly as before.
2. Submit with one photo from the library. It appears on `/resident/violations/<id>`.
3. Submit with three photos. All three appear.
4. Pick a file over 10 MB — rejected inline at selection, never uploaded.
5. Pick a PDF — rejected inline as "Not a supported image".
6. Add two photos, remove one with the × before submitting. Only the remaining one uploads.
7. In DevTools device mode, confirm the layout holds at 390px wide and both buttons are reachable.
8. On a real phone if available: "Take photo" opens the rear camera; "Add from library" allows multi-select.
9. **Partial failure:** temporarily rename the `hoa-documents` bucket in Supabase (or block the storage request in DevTools), submit with a photo, and confirm the report still saves, the amber message names the file, there is **no** auto-redirect, and "Go to report" works. Restore the bucket afterward.
10. **Impersonation:** as an admin, use "Enter portal" to impersonate a resident, then attempt to submit a report with a photo. `createViolationReport` returns `IMPERSONATION_READONLY_MSG` and the submission is refused — critically, confirm **no photo is uploaded**, since the create fails before the upload loop is reached.

- [ ] **Step 8: Correct the spec's testing section**

The spec's §6 lists a Playwright case. No `playwright.config.ts` exists in this repo and `apps/hoa/e2e/inbox.spec.ts` has no configured runner, so that line cannot be honored without new infrastructure. In `docs/superpowers/specs/2026-08-02-resident-violation-photos-design.md` §6, replace:

```markdown
- Playwright: narrow viewport, file input carries `capture` and `multiple`.
```

with:

```markdown
- Narrow viewport and camera behavior are verified by hand — this repo's
  vitest harness is node-only and pure-modules-only (`vitest.config.ts`),
  and no Playwright runner is configured. The manual checklist lives in
  the implementation plan, Task 4 Step 7.
```

- [ ] **Step 9: Commit**

```bash
rtk git add apps/hoa/src/app/resident/report-violation/ReportViolationForm.tsx docs/superpowers/specs/2026-08-02-resident-violation-photos-design.md
rtk git commit -m "feat(hoa): let residents attach photos when reporting a violation

The form had no file field, so a photo could only be attached afterward
from the report page — the one moment the photo exists is standing in
front of the problem. Photos are held in state and uploaded after the
report is created, since the upload action needs a parentId.

A failed upload never rolls back the report; the resident is told which
photos to re-add and is not redirected past the message. Also drops the
now-false 'photos can be emailed separately' helper text."
```

---

## Verification

After Task 4, the whole change is:

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm test:unit
```

plus the manual checklist in Task 4 Step 7. Case 1 (no photos) is the regression that matters most — the existing reporting path must be untouched.

## What this plan does not do

- No image compression or resizing. A Pro RAW capture over 10 MB is rejected with a clear message rather than shrunk. Flagged as a follow-up in the spec's §7.
- No changes to the board-side view — photos surface through the attachment rendering already present on `(dashboard)/violations/reports/[id]`.
- No migration. `submission_attachments`, the `hoa-documents` bucket, and thread type `'concern'` all already exist.
