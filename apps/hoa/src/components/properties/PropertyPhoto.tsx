'use client'

import { useEffect, useRef, useState } from 'react'
import { Home } from 'lucide-react'
import Link from 'next/link'
import { formatAddressLine } from '@/lib/properties/address-format'
import { PHOTO_UPLOAD_HINT } from '@/lib/properties/photo-upload/rules'
import { PHOTO_REASON_HEADER, photoReasonMessage, toPhotoReason, type PhotoReason } from '@/lib/properties/photo-reason'

/**
 * The street picture of a home, from our own route (which asks Google Street
 * View on the server, so the key never reaches the browser).
 *
 * - Fixed 8:5 box, so the page does not jump when the picture arrives.
 * - Lazy: the browser fetches it only when it is near the screen.
 * - `enabled` is computed on the server (is a key set?). When false there is
 *   no request at all, just the house placeholder.
 * - A 404 or any error shows the same neutral placeholder, never a broken image.
 * - Alt text is the formatted address; the credit line is shown with a picture.
 */

export type PhotoState = 'loading' | 'loaded' | 'failed'

export function photoSrc(propertyId: string): string {
  return '/api/properties/' + encodeURIComponent(propertyId) + '/photo'
}

export function PropertyPhotoView({
  propertyId,
  address,
  enabled,
  state,
  className = '',
  reason = null,
  canManage = false,
  uploaded = false,
  canUpload = false,
  onLoad,
  onError,
  imgRef,
}: {
  propertyId: string
  address: string
  enabled: boolean
  state: PhotoState
  className?: string
  /** Why there is no picture (when known). Shown as a sentence under the placeholder. */
  reason?: PhotoReason | null
  canManage?: boolean
  /** M20: the picture is the owner's own upload, so the Street View credit is not shown. */
  uploaded?: boolean
  /** M20 on and the reader may upload: the 'no photo' sentence also offers that. */
  canUpload?: boolean
  onLoad?: () => void
  onError?: () => void
  imgRef?: React.Ref<HTMLImageElement>
}) {
  const label = formatAddressLine(address) || 'This home'
  const showImage = enabled && state !== 'failed'
  return (
    <figure className={`m-0 ${className}`}>
      <div className="relative aspect-[8/5] w-full overflow-hidden rounded-lg border border-border bg-subtle">
        {state !== 'loaded' ? (
          <div
            className="absolute inset-0 flex items-center justify-center text-muted"
            role={showImage ? undefined : 'img'}
            aria-label={showImage ? undefined : `No picture available for ${label}`}
            data-photo-placeholder
          >
            <Home className="size-10" aria-hidden />
          </div>
        ) : null}
        {showImage ? (
          // A plain img on purpose: the route is ours, the bytes are never stored,
          // and next/image would cache a copy on our server.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={photoSrc(propertyId)}
            alt={label}
            loading="lazy"
            decoding="async"
            width={640}
            height={400}
            onLoad={onLoad}
            onError={onError}
            className={`absolute inset-0 size-full object-cover transition-opacity ${state === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
          />
        ) : null}
      </div>
      {showImage && state === 'loaded' && !uploaded ? (
        <figcaption className="mt-1 text-sm text-foreground-secondary">Image: Google Street View</figcaption>
      ) : null}
      {!showImage && reason ? <PhotoReasonNote reason={reason} canManage={canManage} canUpload={canUpload} /> : null}
    </figure>
  )
}

function PhotoReasonNote({ reason, canManage, canUpload }: { reason: PhotoReason; canManage: boolean; canUpload: boolean }) {
  const { text, fix } = photoReasonMessage(reason, canManage)
  return (
    <figcaption className="mt-1 text-sm text-foreground-secondary" data-photo-reason={reason}>
      {text}
      {fix ? (
        <>
          {' '}
          <Link href={fix.href} className="inline-flex min-h-11 items-center font-medium text-primary hover:underline">
            {fix.label}
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
    </figcaption>
  )
}

/**
 * Reads the reason code the photo route sent with its miss. Only the browser
 * cache is asked (only-if-cached), so this never calls our route or Google a
 * second time; if the miss is not cached the sentence stays generic.
 */
async function readCachedReason(propertyId: string): Promise<PhotoReason> {
  try {
    const res = await fetch(photoSrc(propertyId), { cache: 'only-if-cached', mode: 'same-origin' })
    return toPhotoReason(res.headers.get(PHOTO_REASON_HEADER))
  } catch {
    return 'unknown'
  }
}

export function PropertyPhoto({
  propertyId,
  address,
  enabled,
  canManage = false,
  uploaded = false,
  canUpload = false,
  className,
}: {
  propertyId: string
  address: string
  /** Server-computed: a Google key is set. False means no request is made. */
  enabled: boolean
  /** Board or admin: the reason can link to the setting that fixes it. */
  canManage?: boolean
  /** M20: an uploaded photo exists, so it is shown even without a Google key. */
  uploaded?: boolean
  /** M20 on and the reader may upload. */
  canUpload?: boolean
  className?: string
}) {
  const [state, setState] = useState<PhotoState>('loading')
  const [reason, setReason] = useState<PhotoReason | null>(null)
  const fail = () => {
    setState('failed')
    void readCachedReason(propertyId).then(setReason)
  }
  const ref = useRef<HTMLImageElement>(null)

  // The image can fail before React attaches onError (server-rendered page).
  useEffect(() => {
    const img = ref.current
    if (!img || !img.complete) return
    if (img.naturalWidth > 0) setState('loaded')
    else fail()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <PropertyPhotoView
      propertyId={propertyId}
      address={address}
      enabled={enabled || uploaded}
      state={state}
      className={className}
      reason={enabled || uploaded ? reason : 'no_key'}
      canManage={canManage}
      uploaded={uploaded}
      canUpload={canUpload}
      imgRef={ref}
      onLoad={() => setState('loaded')}
      onError={fail}
    />
  )
}
