import { BookOpen, Sparkles } from 'lucide-react'
import type { PaletteCommand } from '@homeowner-portal/ui'
import { openHelp } from '@/lib/guide/open-help'
import { trackHelp } from '@/lib/guide/track'

// ⌘K help commands (BL-070, spec §6.4). Kept apart from HoaChrome so they
// can be unit-tested without the app chrome's Supabase and router imports.

/** A guide article as a ⌘K command (BL-070): already filtered to the viewer's role. */
export interface PaletteHelpArticle {
  id: string
  title: string
  href: string
  keywords: string[]
}

/** The ⌘K fallback row: "Ask the guide: <query>", opening the help drawer with the question. */
export function askGuideCommand(query: string, onUnhandled: () => void): PaletteCommand {
  return {
    id: 'help:ask',
    label: `Ask the guide: ${query}`,
    group: 'Help',
    icon: <Sparkles aria-hidden />,
    // The question goes to the drawer in memory only: never into a URL or log.
    onSelect: () => {
      if (!openHelp({ question: query })) onUnhandled()
    },
  }
}

/** Each article title as a command, with its keywords, in a "Help" group. */
export function helpArticleCommands(articles: readonly PaletteHelpArticle[]): PaletteCommand[] {
  return articles.map((a) => ({
    id: `help:${a.id}`,
    label: a.title,
    group: 'Help',
    href: a.href,
    icon: <BookOpen aria-hidden />,
    keywords: ['help', 'how', ...a.keywords],
    onSelect: () => trackHelp({ event: 'help.article_view', articleId: a.id, source: 'palette' }),
  }))
}
