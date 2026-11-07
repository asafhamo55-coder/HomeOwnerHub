'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiErrorMessage } from '@/lib/api/client'
import { M20_APPLIED } from '@homeowner-portal/db/m20'
import { PHOTO_ACCEPT, PHOTO_MAX_BYTES, resolvePhotoType } from '@/lib/properties/photo-upload/rules'

/**
 * Upload your own photo of a home (M20). Renders nothing while M20 is off.
 *
 * - One labelled file control and plain buttons, every target at least 44px tall.
 * - The browser checks type and size first so a wrong file gets an answer at
 *   once; the server checks again and is the one that counts.
 * - "Replace photo" and "Remove photo" appear only when an uploaded photo exists.
 *   Removing it brings Street View back.
 */
export function PropertyPhotoUpload({
  propertyId,
  hasUpload,
  /** Defaults to the flag; tests pass it to prove the off state. */
  flagOn = M20_APPLIED,
}: {
  propertyId: string
  hasUpload: boolean
  flagOn?: boolean
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  if (!flagOn) return null

  const url = '/api/properties/' + encodeURIComponent(propertyId) + '/photo/upload'
  const inputId = 'photo-upload-' + propertyId

  async function send(init: RequestInit, done: string) {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(url, init)
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null)
        setMessage({ kind: 'error', text: apiErrorMessage(body, 'The photo could not be saved. Please try again.') })
        return
      }
      setMessage({ kind: 'ok', text: done })
      router.refresh()
    } catch {
      setMessage({ kind: 'error', text: 'The photo could not be saved. Check your connection and try again.' })
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!resolvePhotoType(file)) {
      setMessage({ kind: 'error', text: 'Choose a JPG, PNG or WebP picture.' })
      e.target.value = ''
      return
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setMessage({ kind: 'error', text: 'That picture is bigger than 5 MB. Choose a smaller one.' })
      e.target.value = ''
      return
    }
    const form = new FormData()
    form.append('file', file)
    void send({ method: 'POST', body: form }, 'Photo saved.')
  }

  return (
    <div id="photo-upload" className="mt-2 max-w-sm space-y-2" data-photo-upload>
      <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
        {hasUpload ? 'Replace photo' : 'Upload your own photo'}
      </label>
      <input
        ref={input}
        id={inputId}
        type="file"
        accept={PHOTO_ACCEPT}
        disabled={busy}
        onChange={onPick}
        aria-describedby={inputId + '-help'}
        className="block min-h-11 w-full cursor-pointer rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-4 file:text-sm file:font-medium file:text-primary-foreground"
      />
      <p id={inputId + '-help'} className="text-sm text-foreground-secondary">
        JPG, PNG or WebP, up to 5 MB. This replaces the Google Street View picture.
      </p>
      {hasUpload ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void send({ method: 'DELETE' }, 'Photo removed. Street View is showing again.')}
          className="inline-flex min-h-11 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-foreground hover:bg-subtle disabled:opacity-50"
        >
          Remove photo
        </button>
      ) : null}
      <p role="status" aria-live="polite" className={message?.kind === 'error' ? 'text-sm text-danger' : 'text-sm text-foreground-secondary'}>
        {busy ? 'Saving...' : (message?.text ?? '')}
      </p>
    </div>
  )
}
