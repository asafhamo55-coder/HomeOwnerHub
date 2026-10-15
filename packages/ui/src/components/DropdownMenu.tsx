'use client'

import * as React from 'react'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import { cn } from '../lib/cn'

/**
 * DropdownMenu — Radix menu (arrow keys, typeahead, Esc, focus return).
 * For row actions ("⋯"), user menus, and secondary page actions that do
 * not deserve a visible button. Never hide the page's primary action in
 * a menu.
 */

export const DropdownMenu = Menu.Root
export const DropdownMenuTrigger = Menu.Trigger
export const DropdownMenuGroup = Menu.Group
export const DropdownMenuSub = Menu.Sub
export const DropdownMenuRadioGroup = Menu.RadioGroup

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof Menu.Content>,
  React.ComponentPropsWithoutRef<typeof Menu.Content>
>(({ className, sideOffset = 6, align = 'end', ...props }, ref) => (
  <Menu.Portal>
    <Menu.Content
      ref={ref}
      sideOffset={sideOffset}
      align={align}
      collisionPadding={8}
      className={cn(
        'z-popover min-w-[12rem] overflow-hidden rounded-xl border border-border bg-elevated p-1 text-foreground shadow-lg',
        'data-[state=open]:animate-scale-in',
        className,
      )}
      {...props}
    />
  </Menu.Portal>
))
DropdownMenuContent.displayName = 'DropdownMenuContent'

const itemBase =
  'relative flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none transition-colors sm:py-1.5 data-[highlighted]:bg-subtle data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted'

export interface DropdownMenuItemProps extends React.ComponentPropsWithoutRef<typeof Menu.Item> {
  icon?: React.ReactNode
  /** Keyboard hint shown on the right, e.g. "⌘K". */
  shortcut?: string
  destructive?: boolean
}

export const DropdownMenuItem = React.forwardRef<React.ElementRef<typeof Menu.Item>, DropdownMenuItemProps>(
  ({ className, icon, shortcut, destructive, children, asChild, ...props }, ref) => (
    <Menu.Item
      ref={ref}
      asChild={asChild}
      className={cn(
        itemBase,
        destructive && 'text-danger data-[highlighted]:bg-danger-subtle [&_svg]:text-danger',
        className,
      )}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {icon}
          <span className="flex-1 truncate">{children}</span>
          {shortcut ? <kbd className="ml-auto font-sans text-xs text-muted">{shortcut}</kbd> : null}
        </>
      )}
    </Menu.Item>
  ),
)
DropdownMenuItem.displayName = 'DropdownMenuItem'

export const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof Menu.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof Menu.CheckboxItem>
>(({ className, children, ...props }, ref) => (
  <Menu.CheckboxItem ref={ref} className={cn(itemBase, 'pr-8', className)} {...props}>
    <span className="flex-1 truncate">{children}</span>
    <Menu.ItemIndicator className="absolute right-2.5 inline-flex">
      <Check className="!text-primary" aria-hidden />
    </Menu.ItemIndicator>
  </Menu.CheckboxItem>
))
DropdownMenuCheckboxItem.displayName = 'DropdownMenuCheckboxItem'

export const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof Menu.RadioItem>,
  React.ComponentPropsWithoutRef<typeof Menu.RadioItem> & { icon?: React.ReactNode }
>(({ className, children, icon, ...props }, ref) => (
  <Menu.RadioItem ref={ref} className={cn(itemBase, 'pr-8', className)} {...props}>
    {icon}
    <span className="flex-1 truncate">{children}</span>
    <Menu.ItemIndicator className="absolute right-2.5 inline-flex">
      <Check className="!text-primary" aria-hidden />
    </Menu.ItemIndicator>
  </Menu.RadioItem>
))
DropdownMenuRadioItem.displayName = 'DropdownMenuRadioItem'

export function DropdownMenuLabel({ className, ...props }: React.ComponentPropsWithoutRef<typeof Menu.Label>) {
  return <Menu.Label className={cn('px-2.5 pb-1 pt-2 text-xs font-medium text-muted', className)} {...props} />
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentPropsWithoutRef<typeof Menu.Separator>) {
  return <Menu.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
}
