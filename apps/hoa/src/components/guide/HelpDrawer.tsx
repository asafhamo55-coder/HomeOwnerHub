'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronDown, CircleHelp } from 'lucide-react'
import { Button, Sheet, SheetContent, SheetTrigger, cn } from '@homeowner-portal/ui'
import { matchRouteTemplate } from '@/lib/guide/routes'
import type { DrawerArticle, DrawerData } from '@/lib/guide'
import { OPEN_HELP_EVENT, type OpenHelpDetail } from '@/lib/guide/open-help'
import { trackHelp } from '@/lib/guide/track'
import { AskGuide } from './AskGuide'
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
 *
 * Day 2: "Ask about this page" (Ask the guide with this page's route), and
 * `openHelp()` (lib/guide/open-help.ts) opens it on one article — the setup
 * checklist's "How?" links — or with a question to ask (⌘K).
 */
export function HelpDrawer({ data, variant = 'board' }: { data: DrawerData; variant?: 'board' | 'resident' }) {
  const pathname = usePathname()
  const [open, setOpenState] = useState(false)
  const [focus, setFocus] = useState<OpenHelpDetail | null>(null)
  // Remounts Ask the guide for each new prefilled question.
  const [askKey, setAskKey] = useState(0)

  const template = useMemo(() => matchRouteTemplate(pathname ?? '/', Object.keys(data.routeIndex)), [pathname, data])
  // Only state setters: safe to call from the once-registered key listener.
  const setOpen = (next: boolean) => {
    setOpenState(next)
    if (!next) setFocus(null)
  }
  // One drawer_open per opening, however it was opened. A template, never the path.
  useEffect(() => {
    if (open) trackHelp({ event: 'help.drawer_open', routeTemplate: template, matchedCount: template ? (data.routeIndex[template] ?? []).length : 0 })
    // Reporting the page it opened on; re-render while open is not a new open.
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onOpenHelp = (e: Event) => {
      const detail = (e as CustomEvent<OpenHelpDetail>).detail ?? {}
      // An article this viewer's drawer doesn't carry (an admin-only one for
      // a board member): leave the event unclaimed, so the link navigates.
      if (detail.articleId && !data.articles[detail.articleId] && !detail.question) return
      e.preventDefault()
      setFocus(detail)
      setAskKey((k) => k + 1)
      setOpenState(true)
    }
    window.addEventListener(OPEN_HELP_EVENT, onOpenHelp)
    return () => window.removeEventListener(OPEN_HELP_EVENT, onOpenHelp)
  }, [data])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const focused = focus?.articleId ? (data.articles[focus.articleId] ?? null) : null
  const onPage = useMemo<DrawerArticle[]>(() => {
    if (!template) return []
    return (data.routeIndex[template] ?? [])
      .map((id) => data.articles[id])
      .filter((a): a is DrawerArticle => !!a && a.id !== focused?.id)
      .slice(0, MAX_ON_PAGE)
  }, [template, data, focused])

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
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm coarse:min-h-11 font-medium text-foreground-secondary transition-colors duration-fast hover:bg-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CircleHelp className="size-4 shrink-0" aria-hidden />
            <span>Help</span>
          </button>
        )}
      </SheetTrigger>
      <SheetContent title="Help for this page" description="Short how-tos from the HomeownerHub guide." side="right" width="md">
        <div className="space-y-6">
          {focused ? (
            <section aria-labelledby="help-focused" className="space-y-2">
              <h3 id="help-focused" className="text-xs font-semibold uppercase tracking-wide text-muted">
                How to
              </h3>
              <ul className="space-y-2">
                <DrawerArticleItem key={focused.id} article={focused} audience={data.audience} onNavigate={() => setOpen(false)} defaultExpanded />
              </ul>
            </section>
          ) : null}
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
          ) : focused ? null : (
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
          <div className="border-t border-border pt-5">
            <AskGuide
              key={askKey}
              compact
              heading="Ask about this page"
              route={pathname ?? undefined}
              initialQuestion={focus?.question ?? ''}
              autoSubmit={!!focus?.question}
              onNavigate={() => setOpen(false)}
            />
          </div>
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
  defaultExpanded = false,
}: {
  article: DrawerArticle
  audience: DrawerData['audience']
  onNavigate: () => void
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const panelId = `help-steps-${article.id}`
  return (
    <li className="rounded-xl border border-border bg-surface">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => {
          if (!expanded) trackHelp({ event: 'help.article_view', articleId: article.id, source: 'drawer' })
          setExpanded((v) => !v)
        }}
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
