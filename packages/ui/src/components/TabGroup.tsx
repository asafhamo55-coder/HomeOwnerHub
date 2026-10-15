'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '../lib/cn'

/**
 * TabGroup — switch between panels on the same page without navigating
 * (Radix Tabs: roving focus, arrow keys, aria-controls). For sub-pages
 * with their own URL use `Tabs` instead.
 *
 *   <TabGroup defaultValue="overview">
 *     <TabList>
 *       <Tab value="overview">Overview</Tab>
 *       <Tab value="history">History</Tab>
 *     </TabList>
 *     <TabPanel value="overview">…</TabPanel>
 *   </TabGroup>
 *
 * `variant="segmented"` renders a pill switcher for 2–4 short options
 * (view toggles such as List / Board).
 */

type Variant = 'underline' | 'segmented'
const VariantCtx = React.createContext<Variant>('underline')

export interface TabGroupProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {
  variant?: Variant
}

export const TabGroup = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Root>, TabGroupProps>(
  ({ variant = 'underline', className, ...props }, ref) => (
    <VariantCtx.Provider value={variant}>
      <TabsPrimitive.Root ref={ref} className={cn('flex flex-col gap-4', className)} {...props} />
    </VariantCtx.Provider>
  ),
)
TabGroup.displayName = 'TabGroup'

export const TabList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(VariantCtx)
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        variant === 'underline'
          ? 'flex items-end gap-1 overflow-x-auto scrollbar-none border-b border-border'
          : 'inline-flex w-fit items-center gap-0.5 rounded-lg border border-border bg-subtle p-0.5',
        className,
      )}
      {...props}
    />
  )
})
TabList.displayName = 'TabList'

export const Tab = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(VariantCtx)
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        variant === 'underline'
          ? '-mb-px h-10 border-b-2 border-transparent px-3 text-muted hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground'
          : 'h-8 rounded-md px-3 text-muted hover:text-foreground data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  )
})
Tab.displayName = 'Tab'

export const TabPanel = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md', className)}
    {...props}
  />
))
TabPanel.displayName = 'TabPanel'
