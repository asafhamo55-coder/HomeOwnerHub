'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Home } from 'lucide-react'
import { PHOTO_UPLOAD_HINT } from '@/lib/properties/photo-upload/rules'
import { formatAddressLine } from '@/lib/properties/address-format'
import { PHOTO_REASON_HEADER, photoReasonMessage, toPhotoReason, type PhotoReason } from '@/lib/properties/photo-reason'

/**
 * The street picture of a home, from our own route (which asks Google Street
 * View on the server, so the key never reaches the browser).
 *
 * - One request: the picture is fetched once, when the box nears the screen
 *   (IntersectionObserver). On success the bytes become a blob URL for the
 *   img; on a miss the reason code is read from that same response, so there
 *   is never a second call to our route or to Google.
 * - Fixed 8:5 box, so the page does not jump when the picture arrives.
 * - `enabled` and `knownReason` are computed on the server. When either says
 *   there is no picture, no request is made at all.
 * - A miss or any error shows a neutral placeholder and a plain sentence.
 * - Alt text is the formatted address; the credit line is shown with a picture.
 */

export type PhotoState = 'loading' | 'loaded' | 'failed'

export function photoSrc(propertyId: string): string {
  return '/api/properties/' + encodeURIComponent(propertyId) + '/photo'
}

export function PropertyPhotoView({
  address,
  enabled,
  state,
  src = null,
  className = '',
  reason = null,
  canManage = false,
  uploaded = false,
  canUpload = false,
  boxRef,
}: {
  /** Kept for callers that still pass it; the view no longer builds the route URL. */
  propertyId?: string
  address: string
  enabled: boolean
  state: PhotoState
  /** The blob URL of the loaded picture. */
  src?: string | null
  className?: string
  /** Why there is no picture (when known). Shown as a sentence under the placeholder. */
  reason?: PhotoReason | null
  canManage?: boolean
  /** M20: the picture is the owner's own upload, so the Street View credit is not shown. */
  uploaded?: boolean
  /** M20 on and the reader may upload: the 'no photo' sentence also offers that. */
  canUpload?: boolean
  boxRef?: React.Ref<HTMLElement>
}) {
  const label = formatAddressLine(address) || 'This home'
  const showImage = enabled && state === 'loaded' && Boolean(src)
  const note = !showImage && reason ? photoReasonMessage(reason, canManage) : null
  return (
    <figure className={`m-0 ${className}`} ref={boxRef}>
      <div className="relative aspect-[8/5] w-full overflow-hidden rounded-lg border border-border bg-subtle">
        {!showImage ? (
          <div
            className="absolute inset-0 flex items-center justify-center text-muted"
            role="img"
            aria-label={note ? `No picture available for ${label}. ${note.text}` : `No picture available for ${label}`}
            data-photo-placeholder
          >
            <Home className="size-10" aria-hidden />
          </div>
        ) : null}
        {showImage ? (
          // A plain img on purpose: the bytes come from our own route and are never stored.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src!} alt={label} decoding="async" width={640} height={400} className="absolute inset-0 size-full object-cover" />
        ) : null}
      </div>
      {showImage && !uploaded ? (
        <figcaption className="mt-1 text-sm text-foreground-secondary">Image: Google Street View</figcaption>
      ) : null}
      <div aria-live="polite">
        {note ? (
          <p className="mt-1 text-sm text-foreground-secondary" data-photo-reason={reason}>
            {note.text}
            {note.fix ? (
              <>
                {' '}
                <Link href={note.fix.href} className="inline-flex min-h-11 items-center font-medium text-primary hover:underline">
                  {note.fix.label}
                </Link>
              </>
            ) : null}
            {canUpload ? (
              <>
                {' '}
                <a href="#photo-upload" className="inline-flex min-h-11 items-center font-medium text-primary hover:underline">
                  {PHOTO_UPLOAD_HINT}
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </figure>
  )
}

export function PropertyPhoto({
  propertyId,
  address,
  enabled,
  knownReason = null,
  canManage = false,
  uploaded = false,
  canUpload = false,
  className,
}: {
  propertyId: string
  address: string
  /** Server-computed: a Google key is set. False means no request is made. */
  enabled: boolean
  /** Server-computed reason that needs no Google call (no address). No request is made. */
  knownReason?: PhotoReason | null
  /** Board or admin: the reason can link to the setting that fixes it. */
  canManage?: boolean
  /** M20: an uploaded photo exists. It is served by the same route (no Google call), even without a key or an address. */
  uploaded?: boolean
  /** M20 on and the reader may upload. */
  canUpload?: boolean
  className?: string
}) {
  const [state, setState] = useState<PhotoState>('loading')
  const [src, setSrc] = useState<string | null>(null)
  const [fetched, setFetched] = useState<PhotoReason | null>(null)
  const [visible, setVisible] = useState(false)
  const box = useRef<HTMLElement | null>(null)

  const skip = (!enabled && !uploaded) || (knownReason !== null && !uploaded)

  // Lazy: start only when the box is near the screen (or at once without the API).
  useEffect(() => {
    if (skip) return
    const el = box.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [skip, propertyId])

  // The one request. Cleanup aborts it, revokes the blob URL and ignores late results.
  useEffect(() => {
    setState('loading')
    setSrc(null)
    setFetched(null)
    if (skip || !visible) return
    const controller = new AbortController()
    let objectUrl: string | null = null
    let live = true
    ;(async () => {
      try {
        const res = await fetch(photoSrc(propertyId), { signal: controller.signal })
        if (!live) return
        if (res.ok) {
          const blob = await res.blob()
          if (!live) return
          objectUrl = URL.createObjectURL(blob)
          setSrc(objectUrl)
          setState('loaded')
        } else {
          setFetched(toPhotoReason(res.headers.get(PHOTO_REASON_HEADER)))
          setState('failed')
        }
      } catch {
        if (!live) return
        setFetched('upstream')
        setState('failed')
      }
    })()
    return () => {
      live = false
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [skip, visible, propertyId])

  const reason: PhotoReason | null = !enabled && !uploaded ? 'no_key' : (uploaded ? null : knownReason) ?? fetched

  return (
    <PropertyPhotoView
      address={address}
      enabled={enabled || uploaded}
      state={skip ? 'failed' : state}
      src={src}
      className={className}
      reason={reason}
      canManage={canManage}
      uploaded={uploaded}
      canUpload={canUpload}
      boxRef={(el) => {
        box.current = el
      }}
    />
  )
}
