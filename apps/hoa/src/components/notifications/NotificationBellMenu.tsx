'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Bell, CheckCheck, Loader2 } from 'lucide-react'
import { cn } from '@homeowner-portal/ui'
import { markAllNotificationsRead, markNotificationRead } from '@/lib/notifications'

/**
 * One row as the bell renders it. Deliberately not the database row: the
 * age string and the validated href are computed on the server (see
 * NotificationBell) so this component holds no dates and no untrusted
 * strings, and so the "5m ago" label cannot differ between the server's
 * render and the client's hydration.
 */
export interface BellItem {
  id: string
  title: string
  body: string | null
  /** Already through safeNotificationHref. null means render it as plain,
   *  unclickable text rather than guessing at a destination. */
  href: string | null
  age: string
  unread: boolean
}

interface Props {
  items: BellItem[]
  unreadCount: number
  /** Pre-formatted by formatUnreadBadge; null hides the badge entirely. */
  badge: string | null
}

/**
 * The header notification bell.
 *
 * Presentation follows OrgSwitcher exactly — same Radix dropdown, same
 * surface/border/shadow tokens, same item focus treatment — because this
 * sits two elements away from it in the same header and a second dropdown
 * idiom would read as a different product.
 *
 * There is no polling and no realtime subscription here on purpose. The
 * counts are server-rendered per navigation; instant delivery is Web
 * Push's job (see the design doc). What this does do is call
 * router.refresh() after a mutation: App Router reuses the layout across
 * same-layout navigations, so without an explicit refresh the badge would
 * keep showing a stale count until a full page load.
 */
export function NotificationBellMenu({ items, unreadCount, badge }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  // Optimistic read-state. The server action plus router.refresh() is the
  // source of truth, but a refresh takes a round trip and the dropdown is
  // still on screen for all of it — without this the row the user just
  // clicked keeps its unread dot long enough to look broken.
  const [locallyRead, setLocallyRead] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  function handleOpen(next: boolean) {
    setOpen(next)
    // Clear a stale error when the panel is reopened rather than leaving
    // last session's failure pinned under a now-successful list.
    if (next) setError(null)
  }

  function handleSelect(item: BellItem) {
    setError(null)
    if (item.unread) setLocallyRead((prev) => [...prev, item.id])

    startTransition(async () => {
      // Mark first, navigate second: the push lands on a route whose layout
      // re-renders the badge, so doing it the other way round would show
      // the old count on arrival.
      if (item.unread) {
        const result = await markNotificationRead(item.id)
        if (!result.ok) {
          setLocallyRead((prev) => prev.filter((id) => id !== item.id))
          setError(result.error)
          // A failed mark is not a reason to withhold the ticket — fall
          // through to the navigation.
        }
      }
      if (item.href) {
        setOpen(false)
        router.push(item.href)
      }
      router.refresh()
    })
  }

  function handleMarkAll() {
    setError(null)
    setLocallyRead(items.map((i) => i.id))

    startTransition(async () => {
      const result = await markAllNotificationsRead()
      if (!result.ok) {
        setLocallyRead([])
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={handleOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="relative rounded-md p-1.5 text-muted hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : 'Notifications'
          }
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {badge ? (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-fg"
            >
              {badge}
            </span>
          ) : null}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className={cn(
            'z-50 w-[340px] overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-lg',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          )}
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              Notifications
            </span>
            {unreadCount > 0 ? (
              <button
                type="button"
                disabled={pending}
                onClick={handleMarkAll}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted hover:bg-background hover:text-foreground disabled:opacity-60"
              >
                {pending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCheck className="h-3 w-3" />
                )}
                Mark all read
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <p className="px-3 pb-3 pt-1 text-sm text-muted">
              Nothing yet. New resident tickets show up here.
            </p>
          ) : (
            <div className="max-h-[380px] overflow-y-auto">
              {items.map((item) => {
                const unread = item.unread && !locallyRead.includes(item.id)
                return (
                  <DropdownMenu.Item
                    key={item.id}
                    disabled={pending}
                    onSelect={(e) => {
                      // Radix closes on select by default; the close is
                      // driven from handleSelect instead so the panel stays
                      // put when a row has no link to navigate to.
                      e.preventDefault()
                      handleSelect(item)
                    }}
                    className={cn(
                      'flex items-start gap-2.5 rounded-md px-3 py-2 text-sm outline-none',
                      'focus:bg-background data-[disabled]:opacity-60',
                      item.href ? 'cursor-pointer' : 'cursor-default',
                    )}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center pt-0.5">
                      {unread ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block truncate',
                          unread ? 'font-medium text-foreground' : 'text-muted-fg',
                        )}
                      >
                        {item.title}
                      </span>
                      {item.body ? (
                        <span className="mt-0.5 line-clamp-2 block text-[12px] text-muted">
                          {item.body}
                        </span>
                      ) : null}
                      <span className="mt-0.5 block text-[11px] text-muted">{item.age}</span>
                    </span>
                  </DropdownMenu.Item>
                )
              })}
            </div>
          )}

          {error ? (
            <div className="border-t border-border px-3 py-2 text-[11px] text-destructive">
              {error}
            </div>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
