'use client'

import { useState, useTransition } from 'react'
import { Briefcase, ChevronUp, Home, Shield, X } from 'lucide-react'
import { cn } from '@homeowner-portal/ui'
import { setRoleOverride, clearRoleOverride } from '@/lib/role-override'

type Role = 'admin' | 'board' | 'resident'

interface RoleSwitcherProps {
  /** The user's actual role from the DB. Always 'admin' when this
   *  component renders (the server-side mount gates non-admins out). */
  realRole: Role
  /** The currently-active override, if any. */
  override: Role | null
}

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  board: 'Board',
  resident: 'Resident',
}

const ROLE_ICON: Record<Role, React.ReactNode> = {
  admin: <Shield className="h-3.5 w-3.5" />,
  board: <Briefcase className="h-3.5 w-3.5" />,
  resident: <Home className="h-3.5 w-3.5" />,
}

export function RoleSwitcher({ realRole, override }: RoleSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const effective: Role = override ?? realRole
  const isOverriding = override !== null && override !== realRole

  function pick(role: Role) {
    setOpen(false)
    if (role === realRole) {
      startTransition(() => {
        void clearRoleOverride()
      })
    } else {
      startTransition(() => {
        void setRoleOverride(role)
      })
    }
  }

  function reset() {
    setOpen(false)
    startTransition(() => {
      void clearRoleOverride()
    })
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 print:hidden">
      {open ? (
        <div
          className={cn(
            'mb-2 w-56 overflow-hidden rounded-lg border border-border bg-white shadow-lg',
          )}
        >
          <div className="border-b border-border bg-foreground/5 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Dev — view as
            </p>
            <p className="text-xs text-muted">
              UI only · RLS uses your real role
            </p>
          </div>
          <ul className="py-1">
            {(['admin', 'board', 'resident'] as Role[]).map((r) => (
              <li key={r}>
                <button
                  type="button"
                  onClick={() => pick(r)}
                  disabled={isPending}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-foreground/5',
                    effective === r && 'font-semibold text-primary',
                  )}
                >
                  {ROLE_ICON[r]}
                  <span>{ROLE_LABEL[r]}</span>
                  {r === realRole ? (
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-muted">
                      real
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          {isOverriding ? (
            <div className="border-t border-border">
              <button
                type="button"
                onClick={reset}
                disabled={isPending}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted hover:bg-foreground/5"
              >
                <X className="h-3 w-3" />
                Reset to {ROLE_LABEL[realRole]}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className={cn(
          'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-md transition-colors',
          isOverriding
            ? 'border-amber-500 bg-amber-50 text-amber-900 hover:bg-amber-100'
            : 'border-border bg-white text-muted hover:text-foreground',
        )}
        title={
          isOverriding
            ? `Viewing as ${ROLE_LABEL[effective]} (real: ${ROLE_LABEL[realRole]})`
            : `Dev: switch view`
        }
      >
        {ROLE_ICON[effective]}
        <span>View: {ROLE_LABEL[effective]}</span>
        {isOverriding ? (
          <span className="rounded bg-amber-500 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-white">
            override
          </span>
        ) : null}
        <ChevronUp
          className={cn('h-3 w-3 transition-transform', open && 'rotate-180')}
        />
      </button>
    </div>
  )
}
