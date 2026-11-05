'use client'

import { useEffect, useRef, useState } from 'react'
import { Home } from 'lucide-react'
import { formatAddressLine } from '@/lib/properties/address-format'

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
  onLoad,
  onError,
  imgRef,
}: {
  propertyId: string
  address: string
  enabled: boolean
  state: PhotoState
  className?: string
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
      {showImage && state === 'loaded' ? (
        <figcaption className="mt-1 text-xs text-muted">Image: Google Street View</figcaption>
      ) : null}
    </figure>
  )
}

export function PropertyPhoto({
  propertyId,
  address,
  enabled,
  className,
}: {
  propertyId: string
  address: string
  /** Server-computed: a Google key is set. False means no request is made. */
  enabled: boolean
  className?: string
}) {
  const [state, setState] = useState<PhotoState>('loading')
  const ref = useRef<HTMLImageElement>(null)

  // The image can fail before React attaches onError (server-rendered page).
  useEffect(() => {
    const img = ref.current
    if (!img || !img.complete) return
    setState(img.naturalWidth > 0 ? 'loaded' : 'failed')
  }, [])

  return (
    <PropertyPhotoView
      propertyId={propertyId}
      address={address}
      enabled={enabled}
      state={state}
      className={className}
      imgRef={ref}
      onLoad={() => setState('loaded')}
      onError={() => setState('failed')}
    />
  )
}
