'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent } from '@homeowner-portal/ui'

export interface ViewerPhoto {
  src: string
  alt: string
}

const navButton =
  'inline-flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-full border border-border bg-elevated text-foreground hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Thumbnail grid plus an in-page viewer. Previous and Next wrap around, so
 * the arrow keys never dead-end. URLs are used exactly as given.
 */
export function PhotoViewer({ photos }: { photos: ViewerPhoto[] }) {
  const [index, setIndex] = React.useState<number | null>(null)
  const thumbs = React.useRef<Array<HTMLButtonElement | null>>([])
  const lastOpened = React.useRef(0)
  const count = photos.length
  const open = index !== null && index < count
  const current = open ? photos[index as number] : null

  // Radix restores focus on its own, but not when the dialog unmounts in the
  // same commit; put it back on the thumbnail explicitly.
  const wasOpen = React.useRef(false)
  React.useEffect(() => {
    if (wasOpen.current && !open) thumbs.current[lastOpened.current]?.focus()
    wasOpen.current = open
  }, [open])

  const step = (delta: number) =>
    setIndex((i) => (i === null || count === 0 ? i : (i + delta + count) % count))

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      step(-1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      step(1)
    }
  }

  return (
    <>
      {photos.map((p, i) => (
        <button
          key={p.src}
          type="button"
          ref={(el) => {
            thumbs.current[i] = el
          }}
          onClick={() => {
            lastOpened.current = i
            setIndex(i)
          }}
          aria-label={`Open ${p.alt}`}
          className="block overflow-hidden rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.src} alt={p.alt} className="h-32 w-full object-cover" />
        </button>
      ))}

      <Dialog open={open} onOpenChange={(o) => (o ? null : setIndex(null))}>
        <DialogContent
          title="Photo viewer"
          hideTitle
          size="xl"
          onKeyDown={onKeyDown}
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            thumbs.current[lastOpened.current]?.focus()
          }}
        >
          {current ? (
            <div className="space-y-3">
              <div className="flex max-h-[70dvh] items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={current.src} alt={current.alt} className="max-h-[70dvh] w-full object-contain" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={() => step(-1)} aria-label="Previous photo" className={navButton}>
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <div className="flex flex-col items-center gap-1 text-sm">
                  <span aria-live="polite">
                    {(index as number) + 1} of {count}
                  </span>
                  <a
                    href={current.src}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[44px] items-center font-medium text-primary hover:underline"
                  >
                    Open original
                  </a>
                </div>
                <button type="button" onClick={() => step(1)} aria-label="Next photo" className={navButton}>
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
