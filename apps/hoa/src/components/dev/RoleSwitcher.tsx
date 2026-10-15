'use client'

import { useTransition } from 'react'
import { Briefcase, ChevronDown, Eye, Home, RotateCcw, Shield } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from '@homeowner-portal/ui'
import { setRoleOverride, clearRoleOverride } from '@/lib/role-override'

type Role = 'admin' | 'board' | 'resident'

interface RoleSwitcherProps {
  /** The user's actual role from the DB. Always 'admin' when this
   *  component renders (the server-side mount gates non-admins out). */
  realRole: Role
  /** The currently-active override, if any. */
  override: Role | null
  /**
   * Where the control lives. Neither placement floats over the page:
   *   - `toolbar` — a compact menu button docked in the board top bar.
   *   - `banner`  — a slim in-flow strip above the resident top bar, so it
   *     can never cover content or the bottom tab bar.
   */
  placement: 'toolbar' | 'banner'
}

const ROLES: Role[] = ['admin', 'board', 'resident']

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  board: 'Board',
  resident: 'Resident',
}

const ROLE_ICON: Record<Role, React.ReactNode> = {
  admin: <Shield aria-hidden />,
  board: <Briefcase aria-hidden />,
  resident: <Home aria-hidden />,
}

export function RoleSwitcher({ realRole, override, placement }: RoleSwitcherProps) {
  const [isPending, startTransition] = useTransition()

  const effective: Role = override ?? realRole
  const isOverriding = override !== null && override !== realRole

  function pick(value: string) {
    const role = value as Role
    if (role === effective) return
    startTransition(() => {
      void (role === realRole ? clearRoleOverride() : setRoleOverride(role))
    })
  }

  function reset() {
    startTransition(() => {
      void clearRoleOverride()
    })
  }

  const menu = (
    <DropdownMenuContent align="end" className="w-64">
      <DropdownMenuLabel>
        View as
        <span className="mt-0.5 block font-normal">UI only — data access uses your real role.</span>
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup value={effective} onValueChange={pick}>
        {ROLES.map((r) => (
          <DropdownMenuRadioItem key={r} value={r} icon={ROLE_ICON[r]} disabled={isPending}>
            {ROLE_LABEL[r]}
            {r === realRole ? <span className="ml-2 text-xs text-muted">(you)</span> : null}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      {isOverriding ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={<RotateCcw aria-hidden />} onSelect={reset} disabled={isPending}>
            Back to {ROLE_LABEL[realRole]} view
          </DropdownMenuItem>
        </>
      ) : null}
    </DropdownMenuContent>
  )

  if (placement === 'banner') {
    return (
      <div
        role="status"
        className="border-b border-warning/30 bg-warning-subtle text-warning print:hidden"
      >
        <div className="mx-auto flex min-h-10 max-w-2xl items-center gap-2 px-4 py-1.5 text-xs">
          <Eye className="size-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1 truncate">
            <span className="font-semibold">Viewing as {ROLE_LABEL[effective]}</span>
            <span className="hidden sm:inline"> · UI only, data access uses your {ROLE_LABEL[realRole]} role</span>
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                iconRight={<ChevronDown aria-hidden />}
                className="text-warning hover:bg-warning/10 hover:text-warning"
                disabled={isPending}
                aria-label="Switch view"
              >
                <span className="hidden sm:inline">Switch</span>
              </Button>
            </DropdownMenuTrigger>
            {menu}
          </DropdownMenu>
          {isOverriding ? (
            <Button
              variant="secondary"
              size="xs"
              onClick={reset}
              loading={isPending}
              className="border-warning/40 bg-surface text-warning hover:bg-warning-subtle"
            >
              Exit
              <span className="hidden sm:inline">&nbsp;preview</span>
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isPending}
          aria-label={`View as: ${ROLE_LABEL[effective]}${isOverriding ? ' (preview)' : ''}`}
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium transition-colors duration-fast print:hidden',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            '[&_svg]:size-3.5 [&_svg]:shrink-0',
            isOverriding
              ? 'border-warning/40 bg-warning-subtle text-warning hover:bg-warning/15'
              : 'border-border bg-surface text-muted hover:border-border-strong hover:text-foreground',
          )}
        >
          {isOverriding ? <Eye aria-hidden /> : ROLE_ICON[effective]}
          <span className="hidden lg:inline">
            {isOverriding ? `Viewing as ${ROLE_LABEL[effective]}` : `View as ${ROLE_LABEL[effective]}`}
          </span>
          <ChevronDown className="hidden lg:block" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      {menu}
    </DropdownMenu>
  )
}
