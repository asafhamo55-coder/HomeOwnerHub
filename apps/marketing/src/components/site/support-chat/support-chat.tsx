'use client'

// The "Questions? Ask us" button. It is all that ships on a normal page load:
// the panel (chat UI, escalation form, server-action stub) is a separate chunk
// fetched on the first click. Renders nothing unless NEXT_PUBLIC_SUPPORT_CHAT=1.

import dynamic from 'next/dynamic'
import { useRef, useState } from 'react'

const ChatPanel = dynamic(() => import('./chat-panel'), { ssr: false })

export function supportChatEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SUPPORT_CHAT === '1'
}

export function SupportChat({ enabled = supportChatEnabled() }: { enabled?: boolean }) {
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const launcher = useRef<HTMLButtonElement>(null)

  if (!enabled) return null

  return (
    <>
      {!open && (
        <button
          ref={launcher}
          type="button"
          onClick={() => {
            setLoaded(true)
            setOpen(true)
          }}
          aria-haspopup="dialog"
          className="fixed bottom-4 right-4 z-40 inline-flex min-h-12 items-center rounded-full bg-primary px-6 text-base font-semibold text-primary-fg shadow-lg transition-colors hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring print:hidden md:bottom-6 md:right-6"
        >
          Questions? Ask us
        </button>
      )}
      {loaded && (
        <ChatPanel
          open={open}
          onClose={() => {
            setOpen(false)
            // The launcher remounts after this render; focus it then.
            setTimeout(() => launcher.current?.focus(), 0)
          }}
        />
      )}
    </>
  )
}
