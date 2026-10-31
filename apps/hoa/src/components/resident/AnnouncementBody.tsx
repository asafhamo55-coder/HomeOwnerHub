'use client'

import { useId, useState } from 'react'
import { isLongBody } from '@/lib/resident-announcements-list'

/** Announcement text, clamped to about six lines with a Read more toggle. */
export function AnnouncementBody({ body }: { body: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const long = isLongBody(body)
  return (
    <div className="mt-3">
      <p
        id={id}
        className={`whitespace-pre-wrap text-sm text-foreground-secondary ${
          long && !open ? 'line-clamp-6' : ''
        }`}
      >
        {body}
      </p>
      {long ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="mt-1 inline-flex min-h-[44px] items-center text-sm font-medium text-primary hover:underline"
        >
          {open ? 'Show less' : 'Read more'}
        </button>
      ) : null}
    </div>
  )
}
