import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'

/**
 * "How this works" (spec §6.4): the secondary link on a core page's first-
 * run EmptyState, to the guide article for that page. Pass the href from
 * `guideHref('<article-id>')` at the call site — that literal is what
 * guide:check verifies, so a renamed article fails CI.
 */
export function HowThisWorks({ href }: { href: string }) {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href={href} className="no-underline">
        <BookOpen aria-hidden />
        How this works
      </Link>
    </Button>
  )
}
