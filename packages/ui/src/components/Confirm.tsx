'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AlertTriangle, HelpCircle } from 'lucide-react'
import { Button } from './Button'
import { cn } from '../lib/cn'

/**
 * Confirmation — the replacement for `window.confirm` (which Safari renders
 * as an unstyled system sheet; UX audit finding 13).
 *
 * Two ways in:
 *
 *   1. Imperative, 1-for-1 with window.confirm, inside <ConfirmProvider>:
 *        const confirm = useConfirm()
 *        if (!(await confirm({ title: 'Remove member?', destructive: true }))) return
 *
 *   2. Declarative, no provider needed:
 *        <ConfirmDialog
 *          trigger={<Button variant="destructive">Revoke</Button>}
 *          title="Revoke access?" destructive confirmLabel="Revoke"
 *          onConfirm={async () => { await revoke() }} />
 *      An async onConfirm keeps the dialog open with a spinner until it
 *      settles; throw to keep it open (show the error yourself).
 *
 * Both render role="alertdialog", focus Cancel first for destructive
 * actions (so Enter never destroys by accident), and close on Esc.
 */

export interface ConfirmOptions {
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Destructive confirms render the primary action in red. */
  destructive?: boolean
}

function ConfirmBody({
  title,
  description,
  destructive,
}: Pick<ConfirmOptions, 'title' | 'description' | 'destructive'>) {
  const Icon = destructive ? AlertTriangle : HelpCircle
  return (
    <div className="flex items-start gap-4">
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full',
          destructive ? 'bg-danger-subtle text-danger' : 'bg-primary-subtle text-primary',
        )}
        aria-hidden
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5 pt-1">
        <DialogPrimitive.Title className="text-base font-semibold leading-snug text-foreground">
          {title}
        </DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="text-sm text-muted">{description}</DialogPrimitive.Description>
        ) : null}
      </div>
    </div>
  )
}

function ConfirmShell({
  open,
  onOpenChange,
  options,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: ConfirmOptions | null
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = React.useRef<HTMLButtonElement>(null)
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-modal bg-[hsl(220_30%_6%/0.45)] backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          role="alertdialog"
          {...(options?.description ? {} : { 'aria-describedby': undefined })}
          onOpenAutoFocus={(e) => {
            // Destructive: focus Cancel so a stray Enter is safe.
            if (options?.destructive) {
              e.preventDefault()
              cancelRef.current?.focus()
            }
          }}
          onPointerDownOutside={(e) => {
            if (busy) e.preventDefault()
          }}
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault()
          }}
          className={cn(
            'fixed z-modal w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-elevated text-foreground shadow-xl focus:outline-none',
            'inset-0 m-auto h-fit data-[state=open]:animate-scale-in',
          )}
        >
          {options ? (
            <>
              <div className="p-5 sm:p-6">
                <ConfirmBody {...options} />
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-border bg-surface px-5 py-3 sm:flex-row sm:justify-end sm:px-6 rounded-b-xl">
                <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>
                  {options.cancelLabel ?? 'Cancel'}
                </Button>
                <Button
                  variant={options.destructive ? 'destructive' : 'default'}
                  onClick={onConfirm}
                  loading={busy}
                >
                  {options.confirmLabel ?? 'Confirm'}
                </Button>
              </div>
            </>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

type Resolver = (value: boolean) => void

const ConfirmCtx = React.createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<(ConfirmOptions & { resolve: Resolver }) | null>(null)
  const [open, setOpen] = React.useState(false)

  const confirm = React.useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setState({ ...opts, resolve })
        setOpen(true)
      }),
    [],
  )

  const settle = React.useCallback(
    (result: boolean) => {
      state?.resolve(result)
      setOpen(false)
    },
    [state],
  )

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <ConfirmShell
        open={open}
        onOpenChange={(next) => {
          if (!next) settle(false)
        }}
        options={state}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmCtx.Provider>
  )
}

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = React.useContext(ConfirmCtx)
  if (!ctx) {
    throw new Error('useConfirm() must be used inside <ConfirmProvider>')
  }
  return ctx
}

export interface ConfirmDialogProps extends ConfirmOptions {
  /** The element that opens the dialog (usually a Button). */
  trigger: React.ReactElement
  /** Runs on confirm. Async keeps the dialog open with a spinner. Throw to stay open. */
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({ trigger, onConfirm, ...options }: ConfirmDialogProps) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function run() {
    try {
      setBusy(true)
      await onConfirm()
      setOpen(false)
    } catch {
      // Caller surfaces the failure (toast / inline). Stay open.
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {React.cloneElement(trigger as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>, {
        onClick: (e: React.MouseEvent) => {
          ;(trigger.props as { onClick?: (e: React.MouseEvent) => void }).onClick?.(e)
          if (!e.defaultPrevented) setOpen(true)
        },
      })}
      <ConfirmShell
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next)
        }}
        options={options}
        busy={busy}
        onConfirm={run}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
