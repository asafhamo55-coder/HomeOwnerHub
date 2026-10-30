'use client'

import * as React from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle, X } from 'lucide-react'
import { cn } from '../lib/cn'

// Lightweight toast system. Bottom-right on desktop, bottom-centre on
// phones. Each toast auto-dismisses after `duration` ms (paused while
// hovered or focused) unless the user dismisses it. Use via `useToast()`.
//
// Toasts confirm an action or report a non-field error. A validation
// problem belongs next to its field (`Field error=…`), not here.

type ToastTone = 'success' | 'error' | 'info' | 'warning'

export interface ToastOptions {
  message: string
  tone?: ToastTone
  /** Optional bold first line; `message` becomes the detail. */
  title?: string
  /** One inline action, e.g. Undo. */
  action?: { label: string; onClick: () => void }
  /** ms before auto-dismiss. 0 = sticky. Default 4500 (errors 8000). */
  duration?: number
}

interface ToastRow {
  id: number
  message: string
  tone: ToastTone
  title?: string
  action?: ToastOptions['action']
  duration: number
}

const ToastCtx = React.createContext<((opts: ToastOptions) => void) | null>(null)

let nextId = 1

const ICONS = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle } as const
const ICON_COLOR = {
  success: 'text-success',
  error: 'text-danger',
  info: 'text-info',
  warning: 'text-warning',
} as const

export function ToastProvider({
  children,
  viewportClassName,
}: {
  children: React.ReactNode
  /**
   * Extra classes for the toast stack, e.g. `bottom-24` to sit above a
   * bottom tab bar (resident portal) instead of covering it.
   */
  viewportClassName?: string
}) {
  const [toasts, setToasts] = React.useState<ToastRow[]>([])

  const dismiss = React.useCallback((id: number) => {
    setToasts((rows) => rows.filter((r) => r.id !== id))
  }, [])

  const push = React.useCallback((opts: ToastOptions) => {
    const tone = opts.tone ?? 'info'
    const row: ToastRow = {
      id: nextId++,
      message: opts.message,
      tone,
      title: opts.title,
      action: opts.action,
      duration: opts.duration ?? (tone === 'error' ? 8000 : 4500),
    }
    // Cap the stack so a loop cannot bury the page.
    setToasts((rows) => [...rows.slice(-3), row])
  }, [])

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        className={cn(
          'pointer-events-none fixed inset-x-4 bottom-4 z-toast flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end',
          viewportClassName,
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        role="region"
        aria-label="Notifications"
        // A live region that exists before its content does is announced
        // reliably (Safari/VoiceOver misses role=status nodes inserted
        // already-populated). Errors still use role=alert on the toast.
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((t) => (
          <ToastBody key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

function ToastBody({ toast, onDismiss }: { toast: ToastRow; onDismiss: () => void }) {
  const [paused, setPaused] = React.useState(false)
  const remaining = React.useRef(toast.duration)
  const startedAt = React.useRef(Date.now())

  React.useEffect(() => {
    if (toast.duration <= 0 || paused) return
    startedAt.current = Date.now()
    const t = setTimeout(onDismiss, remaining.current)
    return () => {
      clearTimeout(t)
      remaining.current -= Date.now() - startedAt.current
    }
  }, [paused, toast.duration, onDismiss])

  const Icon = ICONS[toast.tone]
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-xl border border-border bg-elevated px-4 py-3 text-foreground shadow-lg"
    >
      <Icon className={cn('mt-0.5 size-[18px] shrink-0', ICON_COLOR[toast.tone])} aria-hidden />
      <div className="min-w-0 flex-1 text-sm leading-snug">
        {toast.title ? <p className="font-semibold">{toast.title}</p> : null}
        <p className={toast.title ? 'mt-0.5 text-muted' : undefined}>{toast.message}</p>
        {toast.action ? (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick()
              onDismiss()
            }}
            className="mt-2 rounded text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:-mb-1 coarse:min-h-11"
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="-mr-1.5 -mt-1 inline-flex size-7 coarse:size-11 coarse:-mr-3 coarse:-mt-2.5 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  )
}

export function useToast(): (opts: ToastOptions) => void {
  const ctx = React.useContext(ToastCtx)
  if (!ctx) {
    throw new Error('useToast() must be used inside <ToastProvider>')
  }
  return ctx
}
