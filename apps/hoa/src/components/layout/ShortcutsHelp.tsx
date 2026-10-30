'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Dialog, DialogContent } from '@homeowner-portal/ui'
import { INBOX_SHORTCUTS } from '@/lib/inbox/keys'
import { GO_CHORD_MS, GO_SHORTCUTS, globalKeyStep } from '@/lib/shortcuts/global'

/** Window event the user menu fires to open the dialog without a key. */
export const SHORTCUTS_OPEN_EVENT = 'shortcuts:open'

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((k, i) => (
        <span key={`${k}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 ? <span className="text-xs text-muted">then</span> : null}
          <kbd className="rounded border border-border bg-subtle px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
        </span>
      ))}
    </span>
  )
}

export function ShortcutsHelp() {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const pendingG = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pathRef = useRef(pathname)
  pathRef.current = pathname

  useEffect(() => {
    function clear() {
      pendingG.current = false
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    }
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null
      const result = globalKeyStep(
        {
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          defaultPrevented: event.defaultPrevented,
          targetTag: target?.tagName ?? null,
          targetEditable: Boolean(
            target?.isContentEditable || target?.closest('[role="dialog"],[role="menu"],[role="listbox"]'),
          ),
          pathname: pathRef.current,
        },
        pendingG.current,
      )
      clear()
      if (result.type === 'none') return
      event.preventDefault()
      if (result.type === 'help') setOpen((o) => !o)
      else if (result.type === 'go') router.push(result.href)
      else {
        pendingG.current = true
        timer.current = setTimeout(clear, GO_CHORD_MS)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener(SHORTCUTS_OPEN_EVENT, onOpen)
    return () => {
      clear()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener(SHORTCUTS_OPEN_EVENT, onOpen)
    }
  }, [router])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Keyboard shortcuts" description="They work anywhere except while you type. Escape closes this list.">
        <div className="space-y-5">
          <section aria-labelledby="shortcuts-general">
            <h3 id="shortcuts-general" className="mb-2 text-sm font-semibold">Anywhere</h3>
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
              <dt><Keys keys={['?']} /></dt>
              <dd className="text-foreground-secondary">Show this list</dd>
              {GO_SHORTCUTS.map((s) => (
                <div key={s.key} className="contents">
                  <dt><Keys keys={['g', s.key]} /></dt>
                  <dd className="text-foreground-secondary">{s.label}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section aria-labelledby="shortcuts-inbox">
            <h3 id="shortcuts-inbox" className="mb-2 text-sm font-semibold">In the inbox</h3>
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
              {INBOX_SHORTCUTS.map((s) => (
                <div key={s.key} className="contents">
                  <dt><Keys keys={[s.key]} /></dt>
                  <dd className="text-foreground-secondary">{s.label}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
