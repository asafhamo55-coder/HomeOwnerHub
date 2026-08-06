'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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

  // Previews are derived during render so they stay in lockstep with `files`.
  // Object URLs are revoked in the cleanup.
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])

  useEffect(() => () => {
    for (const url of previews) URL.revokeObjectURL(url)
  }, [previews])

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
