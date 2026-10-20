'use client'

import Link from 'next/link'
import { ChevronDown, Megaphone, PenSquare } from 'lucide-react'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@homeowner-portal/ui'
import { NEW_MESSAGE_CHOICES } from '@/lib/messages/tabs'

const ICON = { one: PenSquare, many: Megaphone } as const

/**
 * The one "New message" button of the Messages area (BL-102 A11). It forks
 * into the two composers that already exist: one resident (the inbox
 * composer, sent from the HOA mailbox) or many homes (the announcement
 * composer). Each choice is a plain link to today's URL.
 *
 * The menu has role="menu", so the inbox's j/k shortcuts stay quiet while
 * it is open (useInboxKeys ignores keys inside a menu).
 */
export function NewMessageMenu({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} icon={<PenSquare aria-hidden />} iconRight={<ChevronDown aria-hidden />}>
          New message
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {NEW_MESSAGE_CHOICES.map((choice) => {
          const Icon = ICON[choice.key]
          return (
            <DropdownMenuItem key={choice.key} asChild>
              <Link href={choice.href} className="items-start no-underline">
                <Icon aria-hidden className="mt-0.5" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium text-foreground">{choice.label}</span>
                  <span className="text-xs text-muted">{choice.hint}</span>
                </span>
              </Link>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
