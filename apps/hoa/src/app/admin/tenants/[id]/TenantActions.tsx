'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Archive, CheckCircle2, Eye, MoreHorizontal, Pause, Pencil, RotateCcw } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useConfirm,
  useToast,
} from '@homeowner-portal/ui'
import { suspendTenant, resumeTenant, archiveTenant, restoreTenant } from '@/lib/platform-admin'

/**
 * Page-header actions for a tenant. Edit and Preview are visible; the
 * lifecycle actions (suspend / archive) live in the ⋯ menu so the header
 * never shows two loud buttons. When the tenant is suspended or archived,
 * the way back (Resume / Restore) is the one primary action.
 */
export function TenantActions({
  orgId,
  orgName,
  suspendedAt,
  archivedAt,
}: {
  orgId: string
  orgName: string
  suspendedAt: string | null
  archivedAt: string | null
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) {
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        toast({ tone: 'error', title: 'That didn’t work', message: result.error })
        return
      }
      toast({ tone: 'success', message: done })
      router.refresh()
    })
  }

  async function handleSuspend() {
    const ok = await confirm({
      title: `Suspend “${orgName}”?`,
      description:
        'Members of this tenant will not be able to sign in until you resume them. This is logged in the audit trail.',
      confirmLabel: 'Suspend tenant',
      destructive: true,
    })
    if (ok) run(() => suspendTenant(orgId), `${orgName} suspended.`)
  }

  async function handleResume() {
    const ok = await confirm({
      title: `Resume “${orgName}”?`,
      description: 'Sign-in is re-enabled for every member of this tenant.',
      confirmLabel: 'Resume tenant',
    })
    if (ok) run(() => resumeTenant(orgId), `${orgName} resumed.`)
  }

  async function handleArchive() {
    const first = await confirm({
      title: `Archive “${orgName}”?`,
      description:
        'Archiving hides this tenant from active lists and blocks every member sign-in. Data is preserved and the tenant can be restored later.',
      confirmLabel: 'Continue',
      destructive: true,
    })
    if (!first) return
    const second = await confirm({
      title: 'Archive this tenant now?',
      description: `All members of “${orgName}” lose access immediately. A platform admin can restore the tenant later.`,
      confirmLabel: 'Archive tenant',
      cancelLabel: 'Go back',
      destructive: true,
    })
    if (second) run(() => archiveTenant(orgId), `${orgName} archived.`)
  }

  async function handleRestore() {
    const ok = await confirm({
      title: `Restore “${orgName}”?`,
      description: 'The tenant is un-archived, sign-in is re-enabled and it reappears in active lists.',
      confirmLabel: 'Restore tenant',
    })
    if (ok) run(() => restoreTenant(orgId), `${orgName} restored.`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="secondary">
        <Link href={`/admin/tenants/${orgId}/preview`} className="no-underline">
          <Eye aria-hidden />
          Preview
        </Link>
      </Button>
      {!archivedAt ? (
        <Button asChild variant={suspendedAt ? 'secondary' : 'primary'}>
          <Link href={`/admin/tenants/${orgId}/edit`} className="no-underline">
            <Pencil aria-hidden />
            Edit
          </Link>
        </Button>
      ) : null}
      {archivedAt ? (
        <Button onClick={handleRestore} loading={isPending} icon={<RotateCcw aria-hidden />}>
          Restore tenant
        </Button>
      ) : suspendedAt ? (
        <Button onClick={handleResume} loading={isPending} icon={<CheckCircle2 aria-hidden />}>
          Resume tenant
        </Button>
      ) : null}
      {!archivedAt ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="More tenant actions" disabled={isPending}>
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!suspendedAt ? (
              <DropdownMenuItem icon={<Pause aria-hidden />} onSelect={() => void handleSuspend()}>
                Suspend tenant
              </DropdownMenuItem>
            ) : null}
            {!suspendedAt ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem destructive icon={<Archive aria-hidden />} onSelect={() => void handleArchive()}>
              Archive tenant
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}
