'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { cn } from '@homeowner-portal/ui'
import { setActiveOrg } from '@/app/actions/set-active-org'
import type { UserHoaOrg } from '@/lib/orgs'

interface Props {
  currentOrgId: string
  currentOrgName: string
  orgs: UserHoaOrg[]
}

// Sidebar-brand org switcher. The trigger looks like static org-name text
// when there's only one HOA org (no chevron, no interaction). When there
// are 2+ orgs, it becomes a dropdown.
export function OrgSwitcher({ currentOrgId, currentOrgName, orgs }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (orgs.length <= 1) {
    return (
      <p className="truncate text-xs text-muted" title={currentOrgName}>
        {currentOrgName}
      </p>
    )
  }

  function handleSelect(orgId: string) {
    if (orgId === currentOrgId) return
    setError(null)
    startTransition(async () => {
      const result = await setActiveOrg(orgId)
      if (!result.ok) {
        setError(result.reason)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-1 rounded-md py-0.5 text-left transition-colors',
            'hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          )}
          aria-label="Switch HOA"
        >
          <span className="min-w-0 flex-1 truncate text-xs text-muted" title={currentOrgName}>
            {currentOrgName}
          </span>
          {pending ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted" />
          ) : (
            <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted" />
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className={cn(
            'z-50 min-w-[240px] overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-lg',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          )}
        >
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
            Switch HOA
          </div>
          {orgs.map((org) => {
            const isCurrent = org.id === currentOrgId
            return (
              <DropdownMenu.Item
                key={org.id}
                disabled={pending}
                onSelect={(e) => {
                  e.preventDefault()
                  handleSelect(org.id)
                }}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none',
                  'focus:bg-background data-[disabled]:cursor-default data-[disabled]:opacity-60',
                  isCurrent ? 'text-foreground' : 'text-muted-fg',
                )}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {isCurrent ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{org.name}</span>
                  {org.doors_count !== null && (
                    <span className="block text-[11px] text-muted">{org.doors_count} doors</span>
                  )}
                </span>
              </DropdownMenu.Item>
            )
          })}
          {error && (
            <div className="border-t border-border px-3 py-2 text-[11px] text-destructive">
              {error}
            </div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
