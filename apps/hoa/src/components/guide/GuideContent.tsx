import Link from 'next/link'
import { Info } from 'lucide-react'
import { cn } from '@homeowner-portal/ui'
import type { GuideAudience } from '@/lib/guide'
import type { GuideBlock, GuideInline } from '@/lib/guide/types'

// Renders the compiled guide AST (BL-070) with design-system tokens. No
// markdown library and no dangerouslySetInnerHTML: the AST only has the
// node types below. Safe in server and client components.

/** A `[[Label]]` on-screen control, shown as a button-like chip. */
export function UiChip({ label }: { label: string }) {
  return (
    <span className="mx-0.5 inline-flex items-center whitespace-nowrap rounded-md border border-border-strong bg-surface px-1.5 align-baseline text-sm font-medium leading-6 text-foreground shadow-xs">
      {label}
    </span>
  )
}

export function GuideInlines({ nodes, audience }: { nodes: GuideInline[]; audience: GuideAudience }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case 'text':
            return <span key={i}>{n.v}</span>
          case 'strong':
            return (
              <strong key={i} className="font-semibold text-foreground">
                <GuideInlines nodes={n.c} audience={audience} />
              </strong>
            )
          case 'em':
            return (
              <em key={i}>
                <GuideInlines nodes={n.c} audience={audience} />
              </em>
            )
          case 'code':
            return (
              <code key={i} className="rounded-md bg-subtle px-1 text-sm">
                {n.v}
              </code>
            )
          case 'ui':
            return <UiChip key={i} label={n.label} />
          case 'link': {
            const href = n.kind === 'guide' ? (audience === 'resident' ? `/resident/help/${n.href}` : `/help/${n.href}`) : n.href
            return (
              <Link key={i} href={href} className="font-medium text-primary underline underline-offset-2">
                <GuideInlines nodes={n.c} audience={audience} />
              </Link>
            )
          }
        }
      })}
    </>
  )
}

export function GuideShot({ name, alt }: { name: string; alt: string }) {
  return (
    <figure className="my-2">
      <picture>
        <source media="(min-width: 640px)" srcSet={`/guide/shots/${name}--1440.webp`} />
        {/* eslint-disable-next-line @next/next/no-img-element -- static, pre-sized webp from ui:shots --guide */}
        <img
          src={`/guide/shots/${name}--375.webp`}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="h-auto w-auto max-w-full rounded-lg border border-border bg-surface"
        />
      </picture>
    </figure>
  )
}

/**
 * `size="lg"` is the reading size on article pages (16px, large step
 * numbers); `sm` is the drawer.
 */
export function GuideBlocks({
  blocks,
  audience,
  size = 'lg',
}: {
  blocks: GuideBlock[]
  audience: GuideAudience
  size?: 'lg' | 'sm'
}) {
  const text = size === 'lg' ? 'text-base leading-7' : 'text-sm'
  return (
    <div className={cn('space-y-4 text-foreground-secondary', text)}>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'p':
            return (
              <p key={i}>
                <GuideInlines nodes={b.c} audience={audience} />
              </p>
            )
          case 'h3':
            return (
              <h3 key={i} className={cn('font-semibold text-foreground', size === 'lg' ? 'pt-2 text-base' : 'pt-1 text-sm')}>
                {b.text}
              </h3>
            )
          case 'list':
            return (
              <ul key={i} className="list-disc space-y-2 pl-5 marker:text-muted">
                {b.items.map((item, j) => (
                  <li key={j}>
                    <GuideInlines nodes={item} audience={audience} />
                  </li>
                ))}
              </ul>
            )
          case 'steps':
            return (
              <ol key={i} className={cn(size === 'lg' ? 'space-y-3' : 'space-y-2')}>
                {b.items.map((item, j) => (
                  <li key={j} className="flex gap-3">
                    <span
                      aria-hidden
                      className={cn(
                        'num flex shrink-0 items-center justify-center rounded-full bg-primary-subtle font-semibold text-primary',
                        size === 'lg' ? 'size-8 text-sm' : 'size-6 text-xs',
                      )}
                    >
                      {j + 1}
                    </span>
                    <span className={cn('min-w-0 flex-1 text-foreground', size === 'lg' ? 'pt-0.5' : 'pt-px')}>
                      <span className="sr-only">Step {j + 1}: </span>
                      <GuideInlines nodes={item} audience={audience} />
                    </span>
                  </li>
                ))}
              </ol>
            )
          case 'shot':
            return <GuideShot key={i} name={b.name} alt={b.alt} />
          case 'callout':
            return (
              <div key={i} className="flex gap-3 rounded-lg border border-info/30 bg-info-subtle p-4 text-foreground">
                <Info className="mt-1 size-4 shrink-0 text-info" aria-hidden />
                <div className="min-w-0 space-y-2">
                  {b.c.map((para, j) => (
                    <p key={j}>
                      <GuideInlines nodes={para} audience={audience} />
                    </p>
                  ))}
                </div>
              </div>
            )
        }
      })}
    </div>
  )
}
