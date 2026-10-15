import * as React from 'react'
import { ArrowLeft } from 'lucide-react'

export interface BackLinkProps {
  href: string
  label?: React.ReactNode
  /** Router link component (e.g. next/link). Defaults to <a>. */
  linkAs?: React.ElementType
}

/** "← Back to X". Prefer `Page back={…}` or `breadcrumbs`, which place it for you. */
export function BackLink({ href, label = 'Back', linkAs: LinkAs = 'a' }: BackLinkProps) {
  return (
    <LinkAs
      href={href}
      className="-ml-1 inline-flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-sm font-medium text-muted no-underline transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {label}
    </LinkAs>
  )
}
