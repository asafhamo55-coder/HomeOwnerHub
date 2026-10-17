'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronDown, CircleHelp } from 'lucide-react'
import { Button, Sheet, SheetContent, SheetTrigger, cn } from '@homeowner-portal/ui'
import { matchRouteTemplate } from '@/lib/guide/routes'
import type { DrawerArticle, DrawerData } from '@/lib/guide'
import { GuideBlocks } from './GuideContent'

const MAX_ON_PAGE = 5

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/**
 * The "?" contextual help drawer (spec §6.2): a top-bar button that opens a
 * right-hand sheet (full screen on phones) with the guide articles for the
 * page you are on, each expandable to its steps in place. `Shift+/` opens
 * it when focus is not in a field. Radix returns focus to the trigger on
 * close and leaves the page untouched.
 */
export function HelpDrawer({ data, variant = 'board' }: { data: DrawerData; variant?: 'board' | 'resident' }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onPage = useMemo<DrawerArticle[]>(() => {
    const template = matchRouteTemplate(pathname ?? '/', Object.keys(data.routeIndex))
    if (!template) return []
    return (data.routeIndex[template] ?? [])
      .map((id) => data.articles[id])
      .filter((a): a is DrawerArticle => !!a)
      .slice(0, MAX_ON_PAGE)
  }, [pathname, data])

  const startHere = useMemo(
    () =>
      data.startHere.map((p) => ({
        label: p.label,
        articles: p.articleIds.map((id) => data.articles[id]).filter((a): a is DrawerArticle => !!a),
      })),
    [data],
  )
  const helpHome = data.audience === 'resident' ? '/resident/help' : '/help'

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {variant === 'resident' ? (
          <button
            type="button"
            aria-label="Help for this page"
            title="Help for this page"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-foreground-secondary transition-colors duration-fast hover:bg-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CircleHelp className="size-5" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Help for this page"
            title="Help for this page (?)"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-foreground-secondary transition-colors duration-fast hover:bg-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CircleHelp className="size-4 shrink-0" aria-hidden />
            <span className="hidden bar-lg:inline">Help</span>
          </button>
        )}
      </SheetTrigger>
      <SheetContent title="Help for this page" description="Short how-tos from the HomeownerHub guide." side="right" width="md">
        <div className="space-y-6">
          {onPage.length > 0 ? (
            <section aria-labelledby="help-on-page" className="space-y-2">
              <h3 id="help-on-page" className="text-xs font-semibold uppercase tracking-wide text-muted">
                On this page
              </h3>
              <ul className="space-y-2">
                {onPage.map((a) => (
                  <DrawerArticleItem key={a.id} article={a} audience={data.audience} onNavigate={() => setOpen(false)} />
                ))}
              </ul>
            </section>
          ) : (
            <section aria-labelledby="help-start-here" className="space-y-3">
              <p className="text-sm text-muted">The guide has no article for this page yet. These are good places to start.</p>
              <h3 id="help-start-here" className="text-xs font-semibold uppercase tracking-wide text-muted">
                Start here
              </h3>
              {startHere.map((p) => (
                <div key={p.label} className="space-y-1.5">
                  <p className="text-sm font-medium text-foreground">{p.label}</p>
                  <ul className="space-y-1">
                    {p.articles.map((a) => (
                      <li key={a.id}>
                        <Link href={a.href} onClick={() => setOpen(false)} className="text-sm font-medium text-primary">
                          {a.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
          <Button asChild variant="secondary" className="w-full">
            <Link href={helpHome} onClick={() => setOpen(false)} className="no-underline">
              Open the Help centre
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function DrawerArticleItem({
  article,
  audience,
  onNavigate,
}: {
  article: DrawerArticle
  audience: DrawerData['audience']
  onNavigate: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const panelId = `help-steps-${article.id}`
  return (
    <li className="rounded-xl border border-border bg-surface">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors duration-fast hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{article.title}</span>
          <span className="block text-xs text-muted">{article.summary}</span>
        </span>
        <ChevronDown className={cn('mt-0.5 size-4 shrink-0 text-muted transition-transform duration-fast', expanded && 'rotate-180')} aria-hidden />
      </button>
      {expanded ? (
        <div id={panelId} className="space-y-3 border-t border-border p-3">
          {article.steps.length > 0 ? (
            <GuideBlocks blocks={article.steps} audience={audience} size="sm" />
          ) : (
            <p className="text-sm text-muted">This article has no step list. Open it to read more.</p>
          )}
          <Link href={article.href} onClick={onNavigate} className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            Open the full article <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      ) : null}
    </li>
  )
}
