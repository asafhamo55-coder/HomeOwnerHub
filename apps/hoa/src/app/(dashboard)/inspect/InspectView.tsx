'use client'

// BL-028 inspection mode, the screen itself. Stateless: InspectMode owns the
// state, the queue and the effects, so every state of this screen renders
// from props (inspect-previews.test.tsx). Phone first: one column, big
// targets (44px or more), the save button pinned to the bottom of the
// screen within thumb reach.

import Link from 'next/link'
import { Camera, CloudOff, ImagePlus, RefreshCw, Save, Trash2, X } from 'lucide-react'
import { Alert, Button, Field, StatusPill, Textarea, cn } from '@homeowner-portal/ui'
import type { ViolationCategory } from '@/lib/resident-submissions'
import { VIOLATION_CATEGORIES, violationCategoryLabel } from '@/lib/violation-categories'
import type { PropertyOption } from '@/lib/properties/picker-search'
import { MAX_NOTE_CHARS, MAX_PHOTOS_PER_HOME, queueSummary, type QueueItem } from '@/lib/inspect/queue'
import { PropertyPicker } from '../violations/new/PropertyPicker'

export interface InspectPhotoView {
  id: string
  /** An object URL for the thumbnail; null renders a placeholder. */
  previewUrl: string | null
}

export interface InspectSavedView {
  id: string
  homeLabel: string
  category: ViolationCategory
}

export interface InspectViewProps {
  homes: PropertyOption[]
  unlinked: number
  homeId: string
  onHomeChange: (id: string) => void
  photos: InspectPhotoView[]
  onAddPhotos: (files: File[]) => void
  onRemovePhoto: (id: string) => void
  photoError: string | null
  category: ViolationCategory | null
  onCategoryChange: (c: ViolationCategory) => void
  note: string
  onNoteChange: (note: string) => void
  saving: boolean
  onSave: () => void
  saveError: string | null
  /** Everything on this phone still to upload (this session or an earlier one). */
  queue: QueueItem[]
  /** Saved for review during this session. */
  saved: InspectSavedView[]
  online: boolean
  /** False when the queue lives only in this tab's memory. */
  durable: boolean
  syncing: boolean
  onRetryAll: () => void
  onRetryItem: (id: string) => void
  onRemoveItem: (id: string) => void
}

/** What is still missing before Save is allowed, or null when ready. */
export function missingForSave(p: Pick<InspectViewProps, 'homeId' | 'photos' | 'category'>): string | null {
  const missing: string[] = []
  if (!p.homeId) missing.push('a home')
  if (p.photos.length === 0) missing.push('a photo')
  if (!p.category) missing.push('what’s wrong')
  if (missing.length === 0) return null
  const last = missing.pop()!
  return `Add ${missing.length > 0 ? `${missing.join(', ')} and ${last}` : last} to save.`
}

export function InspectView(p: InspectViewProps) {
  const missing = missingForSave(p)
  const summary = queueSummary(p.queue)
  const atPhotoLimit = p.photos.length >= MAX_PHOTOS_PER_HOME

  return (
    <div className="space-y-6 pb-4">
      <QueueBanner {...p} label={summary.label} waiting={summary.waiting} />

      {!p.durable ? (
        <Alert variant="warning" title="Keep this page open">
          This browser can’t keep photos after the page closes. Stay here until everything has uploaded.
        </Alert>
      ) : null}

      <section aria-labelledby="inspect-home" className="space-y-2">
        <h2 id="inspect-home" className="text-base font-semibold text-foreground">
          1. Home
        </h2>
        {p.homes.length === 0 ? (
          <Alert
            variant="info"
            title="No homes to inspect yet"
            actions={
              <Button asChild variant="secondary" size="lg">
                <Link href="/properties">Go to Properties</Link>
              </Button>
            }
          >
            Inspection needs your homes listed under Properties first.
          </Alert>
        ) : (
          <Field
            label="Home"
            hideLabel
            hint={
              p.unlinked > 0
                ? `${p.unlinked} home${p.unlinked === 1 ? ' isn’t' : 's aren’t'} listed because ${p.unlinked === 1 ? 'it has' : 'they have'} no unit record yet.`
                : 'Type a street, house number or unit.'
            }
          >
            <PropertyPicker options={p.homes} value={p.homeId} onChange={p.onHomeChange} disabled={p.saving} />
          </Field>
        )}
      </section>

      <section aria-labelledby="inspect-photos" className="space-y-2">
        <h2 id="inspect-photos" className="text-base font-semibold text-foreground">
          2. Photos
          <span className="ml-1.5 text-sm font-normal text-muted" aria-live="polite">
            ({p.photos.length} of {MAX_PHOTOS_PER_HOME})
          </span>
        </h2>
        <input
          id="inspect-camera"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/*"
          capture="environment"
          multiple
          className="sr-only"
          disabled={p.saving || atPhotoLimit}
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files ?? [])
            e.currentTarget.value = ''
            if (files.length > 0) p.onAddPhotos(files)
          }}
        />
        {p.photos.length > 0 ? (
          <ul className="grid grid-cols-3 gap-2" aria-label="Photos for this home">
            {p.photos.map((photo, i) => (
              <li key={photo.id} className="relative aspect-square overflow-hidden rounded-lg border border-border bg-subtle">
                {photo.previewUrl ? (
                  // Local object URL of a photo just taken; nothing for next/image to optimise.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.previewUrl} alt={`Photo ${i + 1}`} className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center text-xs text-muted">Photo {i + 1}</span>
                )}
                <button
                  type="button"
                  onClick={() => p.onRemovePhoto(photo.id)}
                  disabled={p.saving}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-full bg-foreground/70 text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-5" aria-hidden />
                </button>
              </li>
            ))}
            {!atPhotoLimit ? (
              <li>
                <label
                  htmlFor="inspect-camera"
                  className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border-strong bg-subtle text-center hover:border-primary hover:bg-primary-subtle"
                >
                  <ImagePlus className="size-6 text-muted" aria-hidden />
                  <span className="text-sm font-medium text-foreground">Add</span>
                </label>
              </li>
            ) : null}
          </ul>
        ) : (
          <label
            htmlFor="inspect-camera"
            className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-subtle px-4 py-6 text-center hover:border-primary hover:bg-primary-subtle"
          >
            <Camera className="size-8 text-primary" aria-hidden />
            <span className="text-base font-semibold text-foreground">Take photo</span>
            <span className="text-sm text-muted">Or choose from your library. JPG, PNG, WebP or HEIC, under 25 MB.</span>
          </label>
        )}
        {p.photoError ? (
          <p role="alert" className="text-sm text-danger">
            {p.photoError}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="inspect-category" className="space-y-2">
        <h2 id="inspect-category" className="text-base font-semibold text-foreground">
          3. What’s wrong?
        </h2>
        <div role="radiogroup" aria-labelledby="inspect-category" className="grid grid-cols-2 gap-2">
          {VIOLATION_CATEGORIES.map((c) => {
            const on = p.category === c.value
            return (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={p.saving}
                onClick={() => p.onCategoryChange(c.value)}
                className={cn(
                  'min-h-12 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  on
                    ? 'border-primary bg-primary-subtle text-foreground ring-1 ring-primary'
                    : 'border-border-strong bg-surface text-foreground hover:bg-subtle',
                )}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="inspect-note" className="space-y-2">
        <h2 id="inspect-note" className="text-base font-semibold text-foreground">
          4. Note <span className="text-sm font-normal text-muted">(optional)</span>
        </h2>
        <Field label="Note" hideLabel hint="What you saw, in a few words. Covenant Brain uses it to find the rule.">
          <Textarea
            rows={3}
            maxLength={MAX_NOTE_CHARS}
            value={p.note}
            disabled={p.saving}
            onChange={(e) => p.onNoteChange(e.currentTarget.value)}
            placeholder="e.g. Boat trailer in the driveway"
          />
        </Field>
      </section>

      <div className="sticky bottom-0 z-sticky -mx-4 border-t border-border bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4">
        {p.saveError ? (
          <p role="alert" className="mb-2 text-sm text-danger">
            {p.saveError}
          </p>
        ) : null}
        <Button
          type="button"
          size="lg"
          className="h-14 w-full text-base"
          icon={<Save aria-hidden />}
          loading={p.saving}
          disabled={missing !== null}
          onClick={p.onSave}
        >
          Save for review
        </Button>
        <p className="mt-1.5 text-center text-xs text-muted">
          {missing ?? 'Saves a draft for the board. Nothing is sent to the owner.'}
        </p>
      </div>

      <SessionList {...p} />
    </div>
  )
}

function QueueBanner(p: InspectViewProps & { label: string | null; waiting: number }) {
  return (
    <div aria-live="polite">
      {!p.online ? (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2.5 text-sm text-foreground">
          <CloudOff className="size-5 shrink-0" aria-hidden />
          <span>You’re offline. Keep going: saved homes upload when you have signal.</span>
        </div>
      ) : null}
      {p.label ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-subtle px-3 py-2">
          <span className="text-sm font-medium text-foreground">
            {p.syncing ? 'Uploading… ' : ''}
            {p.label}
          </span>
          {p.waiting > 0 ? (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              icon={<RefreshCw aria-hidden />}
              disabled={p.syncing || !p.online}
              onClick={p.onRetryAll}
            >
              Retry now
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function SessionList(p: InspectViewProps) {
  if (p.queue.length === 0 && p.saved.length === 0) return null
  return (
    <section aria-labelledby="inspect-session" className="space-y-2">
      <h2 id="inspect-session" className="text-base font-semibold text-foreground">
        This inspection
      </h2>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {p.queue.map((item) => (
          <li key={item.id} className="space-y-2 px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{item.homeLabel}</p>
                <p className="text-xs text-muted">
                  {violationCategoryLabel(item.category)} · {item.photos.length} photo{item.photos.length === 1 ? '' : 's'}
                </p>
              </div>
              {item.status === 'needs_attention' ? (
                <StatusPill tone="danger" label="Needs attention" />
              ) : (
                <StatusPill tone="warning" label="Waiting to upload" />
              )}
            </div>
            {item.status === 'needs_attention' ? (
              <>
                {item.lastError ? <p className="text-sm text-foreground">{item.lastError}</p> : null}
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" size="lg" className="flex-1" icon={<RefreshCw aria-hidden />} onClick={() => p.onRetryItem(item.id)}>
                    Retry
                  </Button>
                  <Button type="button" variant="ghost" size="lg" className="flex-1" icon={<Trash2 aria-hidden />} onClick={() => p.onRemoveItem(item.id)}>
                    Remove
                  </Button>
                </div>
              </>
            ) : item.lastError ? (
              <p className="text-xs text-muted">{item.lastError}</p>
            ) : null}
          </li>
        ))}
        {p.saved.map((s) => (
          <li key={s.id} className="flex items-start justify-between gap-2 px-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{s.homeLabel}</p>
              <p className="text-xs text-muted">{violationCategoryLabel(s.category)}</p>
            </div>
            <StatusPill tone="success" label="Saved for review" />
          </li>
        ))}
      </ul>
      {p.saved.length > 0 ? (
        <p className="text-sm text-muted">
          Drafts wait in the{' '}
          <Link href="/violations/approval-queue" className="font-medium text-primary underline-offset-2 hover:underline">
            violation approval queue
          </Link>{' '}
          and in Approvals until the board approves or rejects them.
        </p>
      ) : null}
    </section>
  )
}
